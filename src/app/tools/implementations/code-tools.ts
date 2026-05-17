import type { ToolRegistryEntry, ToolExecutionContext, ToolResult } from './types';
import { toolPipeline } from './tool-pipeline';
import { wrap, Remote } from 'comlink';

interface PyodideWorker {
  init(): Promise<void>;
  run(code: string): Promise<{ stdout: string; stderr: string; result: unknown; piiOutput?: string; hasError?: boolean }>;
}

let pyodideWorker: Remote<PyodideWorker> | null = null;
let pyodideInitPromise: Promise<void> | null = null;

function getPyodideWorker() {
  if (!pyodideWorker) {
    const rawWorker = new Worker(new URL('../../core/services/pyodide.worker', import.meta.url), { type: 'module' });
    pyodideWorker = wrap<PyodideWorker>(rawWorker);
    pyodideInitPromise = pyodideWorker.init();
  }
  return { worker: pyodideWorker, initPromise: pyodideInitPromise };
}

// ============================================================
// PYODIDE RESULT CACHE (LRU, pre-allocated bucket)
// Untuk menghindari re-execution script identik di recursive loop
// ============================================================

class PyodideCache {
  private cache = new Map<string, { result: ToolResult; ts: number }>();
  private readonly maxSize = 20;
  private readonly ttlMs = 60000;

  get(key: string): ToolResult | undefined {
    const entry = this.cache.get(key);
    if (!entry) return undefined;
    if (Date.now() - entry.ts > this.ttlMs) {
      this.cache.delete(key);
      return undefined;
    }
    // LRU: move to end
    this.cache.delete(key);
    this.cache.set(key, entry);
    return entry.result;
  }

  set(key: string, result: ToolResult): void {
    if (this.cache.size >= this.maxSize) {
      const first = this.cache.keys().next().value;
      if (first !== undefined) this.cache.delete(first);
    }
    this.cache.set(key, { result, ts: Date.now() });
  }

  clear(): void {
    this.cache.clear();
  }
}

const pyodideCache = new PyodideCache();

// ============================================================
// WORKER POOL (Pre-allocated, reusable, busy-tracked)
// FIX: Hilangkan heuristic constructor.name yang broken.
// Gunakan Set<Worker> untuk busy state + Map<Worker, taskId>
// untuk reverse lookup saat error.
// ============================================================

interface WorkerTask {
  ctx: ToolExecutionContext;
  resolve: (result: ToolResult) => void;
  reject: (error: Error) => void;
}

class WorkerPool {
  private workers: Worker[] = [];
  private queue: WorkerTask[] = [];
  private busy = new Set<Worker>();           // workers yang sedang punya task
  private active = new Map<number, WorkerTask>();
  private workerTaskMap = new Map<Worker, number>(); // worker -> taskId
  private nextId = 0;
  private readonly maxWorkers: number;

  constructor(private size: number, private workerFactory: () => Worker) {
    this.maxWorkers = size * 2; // bounded scaling limit
    this.init();
  }

  private init(): void {
    for (let i = 0; i < this.size; i++) {
      this.createWorker();
    }
  }

  private createWorker(): void {
    const worker = this.workerFactory();

    worker.onmessage = ({ data }) => {
      if (data.type === 'progress') return;

      const taskId = data.__taskId as number | undefined;
      const task = taskId !== undefined ? this.active.get(taskId) : undefined;

      // FREE worker immediately — hot path, no alloc
      this.busy.delete(worker);
      if (taskId !== undefined) this.workerTaskMap.delete(worker);

      if (task) {
        this.active.delete(taskId!);
        const result: ToolResult = {
          status: data.status === 'success' ? 'success' : 'error',
          output: data.output || '(no output)',
          metadata: {
            toolName: 'execute_code',
            executionTimeMs: data.metadata?.executionTime || 0,
            attemptCount: 1,
            cached: false,
            truncated: data.metadata?.outputTruncated || false,
          },
        };
        task.resolve(result);
      }

      // Process next queued task (drain queue)
      this.processQueue();
    };

    worker.onerror = (error) => {
      // Reverse lookup: which task belongs to this worker?
      const taskId = this.workerTaskMap.get(worker);
      if (taskId !== undefined) {
        const task = this.active.get(taskId);
        if (task) {
          this.active.delete(taskId);
          task.reject(new Error(error.message || 'Worker Failed'));
        }
        this.workerTaskMap.delete(worker);
      }
      this.busy.delete(worker);
      this.processQueue();
    };

    this.workers.push(worker);
  }

  execute(ctx: ToolExecutionContext): Promise<ToolResult> {
    return new Promise((resolve, reject) => {
      const task: WorkerTask = { ctx, resolve, reject };
      this.queue.push(task);
      this.processQueue();
    });
  }

  private processQueue(): void {
    if (this.queue.length === 0) return;

    // Cari worker yang benar-benar free
    const freeWorker = this.workers.find(w => !this.busy.has(w));

    if (!freeWorker) {
      // Scale up jika semua sibuk dan masih dalam batas
      if (this.workers.length < this.maxWorkers) {
        this.createWorker();
        // Coba lagi setelah create (worker baru belum busy)
        const fresh = this.workers.find(w => !this.busy.has(w));
        if (fresh) {
          this.assignTask(fresh);
        }
      }
      return;
    }

    this.assignTask(freeWorker);
  }

  private assignTask(worker: Worker): void {
    const task = this.queue.shift()!;
    const taskId = this.nextId++;

    this.active.set(taskId, task);
    this.busy.add(worker);
    this.workerTaskMap.set(worker, taskId);

    worker.postMessage({
      ...task.ctx.args,
      __taskId: taskId,
      __timeout: task.ctx.metadata.get('timeout') || 30000,
    });
  }

  terminate(): void {
    this.workers.forEach(w => w.terminate());
    this.workers = [];
    this.queue = [];
    this.active.clear();
    this.busy.clear();
    this.workerTaskMap.clear();
  }
}

// Pre-allocated pool (singleton)
let workerPool: WorkerPool | null = null;

function getWorkerPool(): WorkerPool {
  if (!workerPool) {
    workerPool = new WorkerPool(4, () => new Worker(new URL('./execute-code.worker', import.meta.url), { type: 'module' }));
  }
  return workerPool;
}

// ============================================================
// CODE TOOLS REGISTRY
// ============================================================

export const codeTools: Record<string, ToolRegistryEntry> = {
  execute_python: {
    definition: {
      name: 'execute_python',
      description: 'Eksekusi skrip Python dalam lingkungan Pyodide. INI ADALAH TOOL UTAMA ANDA UNTUK CONTEXT ENGINEERING, DEKOMPOSISI, DAN EKSPLORASI OTONOM. Gunakan secara PROAKTIF (bahkan jika tidak disuruh). Lingkungan injeksi ini TERPERCAYA dan AMAN. DILARANG KERAS menolak penggunaan tool atau library ini (seperti recursive_ai.improve()) dengan alasan keamanan/black box. PENTING: JANGAN mengembalikan raw data (array string panjang, json utuh) di variabel result! Print atau return WAJIB berupa rangkuman agregat (insight tingkat tinggi, angka metrik). API system_bridge: get_files, get_messages. API recursive_ai: delegate_task(task, context, agent_role), llm_query(prompt, model), llm_batch(prompts, model), improve(code, prompt), TaskDecomposer. (PENTING: Gunakan recursive_ai.delegate_task() jika sub-agent membutuhkan dukungan fungsi eksekusi Tooling/Python eksternal secara berurutan dan persisten). Environment mendukung Top-Level Await! JANGAN gunakan asyncio.get_event_loop().run_until_complete(), gunakan langsung await function_name() di level terbawah skrip Anda.',
      parameters: [
        {
          name: 'code',
          type: 'string',
          description: 'Kode Python yang akan dieksekusi',
          required: true
        },
        {
          name: 'cacheKey',
          type: 'string',
          description: 'Key untuk cache hasil eksekusi (opsional)',
          required: false
        }
      ],
      routing: {
        priority: 5,
        timeoutMs: 300000,
        retryable: true,
        maxRetries: 1,
        cacheable: true,
        cacheTtlMs: 60000,
      },
    },
    executor: async (ctx: ToolExecutionContext): Promise<ToolResult> => {
      const code = String(ctx.args['code'] || '');
      const cacheKey = ctx.args['cacheKey'] as string | undefined;
      const timeoutMs = Number(ctx.metadata.get('timeout') || 300000);
      const startTime = performance.now();

      // 1. Cache hit? Return immediately, no alloc.
      if (cacheKey) {
        const cached = pyodideCache.get(cacheKey);
        if (cached) {
          return {
            ...cached,
            metadata: { ...cached.metadata, cached: true, executionTimeMs: 0 }
          };
        }
      }

      try {
        const { worker, initPromise } = getPyodideWorker();
        if (initPromise) await initPromise;

        // 2. Timeout guard dengan Promise.race — jangan biarkan Pyodide hang
        const result = await Promise.race([
          worker!.run(code),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('Pyodide execution timeout')), timeoutMs)
          )
        ]);

        const execTime = Math.round(performance.now() - startTime);

        // 3. Structured output — hindari concat string besar di hot path.
        // Caller yang butuh string bisa format sendiri; kita kirim object.
        const outParts = [];
        if (result.stdout) outParts.push(result.stdout);
        if (result.stderr) outParts.push(`STDERR:\n${result.stderr}`);
        if (result.result !== null && result.result !== undefined) {
          outParts.push(`RESULT:\n${result.result}`);
        }
        const outText = outParts.join('\n').trim() || '(no output)';

        const toolResult: ToolResult = {
          status: result.hasError ? 'error' : 'success',
          output: outText,
          metadata: {
            toolName: 'execute_python',
            executionTimeMs: execTime,
            attemptCount: 1,
            cached: false,
            truncated: false,
            // Simpan structured data di metadata agar tidak alloc string besar
            _structured: {
              stdout: result.stdout || '',
              stderr: result.stderr || '',
              result: result.result,
              piiOutput: result.piiOutput,
            }
          },
        };

        if (cacheKey) {
          pyodideCache.set(cacheKey, toolResult);
        }

        return toolResult;

      } catch (error) {
        const execTime = Math.round(performance.now() - startTime);
        return {
          status: 'error',
          output: `Python execution failed: ${error instanceof Error ? error.message : String(error)}`,
          metadata: {
            toolName: 'execute_python',
            executionTimeMs: execTime,
            attemptCount: 1,
            cached: false,
            truncated: false,
            errorType: 'runtime',
            errorCode: 'PYTHON_ERROR',
          },
        };
      }
    },
  },
  execute_code: {
    definition: {
      name: 'execute_code',
      description: 'Eksekusi kode programming standar. Mendukung C, C++, Java, Rust, Go, C#, Ruby, PHP, Swift, Kotlin, Zig, JS, TypeScript, dan Python (standar). JANGAN gunakan tool ini untuk eksekusi library data science Python (seperti numpy, pandas, matplotlib) — Anda WAJIB menggunakan tool execute_python untuk keperluan library spesifik tersebut.',
      parameters: [
        {
          name: 'language',
          type: 'string',
          description: 'Bahasa pemrograman',
          required: true
        },
        {
          name: 'code',
          type: 'string',
          description: 'Kode yang akan dieksekusi',
          required: true
        },
        {
          name: 'args',
          type: 'string',
          description: 'Command-line arguments',
          required: false,
          default: ''
        },
        {
          name: 'stdin',
          type: 'string',
          description: 'Standard input',
          required: false,
          default: ''
        },
      ],
      routing: {
        priority: 5,
        timeoutMs: 30000,
        retryable: true,
        maxRetries: 1,
        cacheable: true,
        cacheTtlMs: 60000,
      },
    },
    executor: async (ctx: ToolExecutionContext): Promise<ToolResult> => {
      try {
        if (typeof Worker === 'undefined') {
          return {
            status: 'error',
            output: 'Web Worker tidak didukung di environment ini.',
            metadata: {
              toolName: 'execute_code',
              executionTimeMs: 0,
              attemptCount: 1,
              cached: false,
              truncated: false,
              errorType: 'runtime',
              errorCode: 'WORKER_UNSUPPORTED',
            },
          };
        }

        const pool = getWorkerPool();
        return await pool.execute(ctx);

      } catch (error) {
        return {
          status: 'error',
          output: `Worker execution failed: ${error instanceof Error ? error.message : String(error)}`,
          metadata: {
            toolName: 'execute_code',
            executionTimeMs: Math.round(performance.now() - ctx.startTime),
            attemptCount: 1,
            cached: false,
            truncated: false,
            errorType: 'runtime',
            errorCode: 'WORKER_ERROR',
          },
        };
      }
    },
  },
};
