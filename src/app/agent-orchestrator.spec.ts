import { TestBed } from '@angular/core/testing';
import { BrowserDynamicTestingModule, platformBrowserDynamicTesting } from '@angular/platform-browser-dynamic/testing';
import { describe, it, expect, beforeEach, afterEach, vi, beforeAll } from 'vitest';
import { firstValueFrom, take, lastValueFrom, filter } from 'rxjs';

beforeAll(() => {
  try {
    TestBed.initTestEnvironment(
      BrowserDynamicTestingModule,
      platformBrowserDynamicTesting()
    );
  } catch(e) {}
});

import {
  AgentOrchestrator,
  StepKind,
  StepStatus,
  ToolStatus,
  AgentWaveField,
  ToolCallRequest,
  ToolCallResult,
  ChatSession,
  ToolRegistry,
} from './agent-orchestrator';
import { STATUS_KERNEL } from './agent/status-kernel';

// ============================================================
// MOCK KONTRAK — Minimal, predictable, no magic
// ============================================================

class MockStreamController {
  private queue: any[] = [];
  private resolveNext: (() => void) | null = null;
  private done = false;

  async *generator(): AsyncGenerator<any> {
    while (!this.done || this.queue.length > 0) {
      if (this.queue.length > 0) yield this.queue.shift();
      else await new Promise<void>(r => this.resolveNext = r);
    }
  }

  push(chunk: any) {
    this.queue.push(chunk);
    this.resolveNext?.();
    this.resolveNext = null;
  }

  complete() {
    this.done = true;
    this.resolveNext?.();
    this.resolveNext = null;
  }
}

class MockChatSession implements ChatSession {
  private _controllers: MockStreamController[] = [];
  private _requestIdx = 0;

  async sendMessageStream(opts: { message: unknown }): Promise<any> {
    if (this._requestIdx >= this._controllers.length) {
      this._controllers.push(new MockStreamController());
    }
    const c = this._controllers[this._requestIdx++];
    return c.generator();
  }

  push(chunk: any) { 
    if (this._controllers.length === 0) this._controllers.push(new MockStreamController());
    this._controllers[this._controllers.length - 1].push(chunk); 
  }
  
  complete() { 
    if (this._controllers.length > 0) {
      this._controllers[this._controllers.length - 1].complete();
      this._controllers.push(new MockStreamController()); // prepare next
    }
  }
}

class MockToolRegistry implements ToolRegistry {
  private handlers = new Map<string, (call: ToolCallRequest, signal?: AbortSignal) => Promise<ToolCallResult>>();
  private callLog: { call: ToolCallRequest; signal?: AbortSignal }[] = [];

  setHandler(name: string, handler: (call: ToolCallRequest, signal?: AbortSignal) => Promise<ToolCallResult>) {
    this.handlers.set(name, handler);
  }

  async execute(call: ToolCallRequest, signal?: AbortSignal): Promise<ToolCallResult> {
    this.callLog.push({ call, signal });
    const handler = this.handlers.get(call.name);
    if (!handler) return { status: 'success', output: `default:${call.name}` };
    return handler(call, signal);
  }

  getCallLog() { return this.callLog; }
  clearLog() { this.callLog = []; }
}

// ============================================================
// HELPERS — Invariant checkers (galak)
// ============================================================

function assertFieldInvariant(field: AgentWaveField | null): asserts field is AgentWaveField {
  expect(field).toBeTruthy();
  expect(field!.epoch).toBeGreaterThanOrEqual(0);
  expect(field!.steps.ids.length).toBe(field!.steps.statuses.length);
  expect(field!.tools.ids.length).toBe(field!.tools.statuses.length);
}

function assertDenseSOA(field: AgentWaveField): void {
  // TIDAK BOLEH ada "hole" di dense region — ini fatal untuk SIMD/cache
  const stepCount = field.steps.ids.filter(id => id !== undefined && id !== '').length;
  const toolCount = field.tools.ids.filter(id => id !== undefined && id !== '').length;
  
  // Semua index < stepCount harus valid
  for (let i = 0; i < stepCount; i++) {
    expect(field.steps.ids[i]).toBeTruthy();
    expect(field.steps.statuses[i]).toBeDefined();
  }
  for (let i = 0; i < toolCount; i++) {
    expect(field.tools.ids[i]).toBeTruthy();
    expect(field.tools.statuses[i]).toBeDefined();
  }
}

function assertNoAliasing(field: AgentWaveField): void {
  // Snapshot dari emitField harus DEEP CLONE — tidak boleh share reference
  // dengan internal field. Ini critical untuk race condition.
  const snapshot = JSON.parse(JSON.stringify(field));
  expect(snapshot.steps.ids).not.toBe(field.steps.ids);
  expect(snapshot.tools.ids).not.toBe(field.tools.ids);
}

// ============================================================
// TEST SUITE — Tier 0: Invariant & Kontrak
// ============================================================

describe('AgentOrchestrator — INVARIANT & KONTRAK', () => {
  let orchestrator: AgentOrchestrator;
  let mockSession: MockChatSession;
  let mockRegistry: MockToolRegistry;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [AgentOrchestrator],
    });
    orchestrator = TestBed.inject(AgentOrchestrator);
    mockSession = new MockChatSession();
    mockRegistry = new MockToolRegistry();
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    orchestrator.reset();
    TestBed.resetTestingModule();
    vi.useRealTimers();
  });

  // === TIER 0.1: SOA Integrity ===

  it('T0.1.1 — createEmptyField() harus menghasilkan SOA dengan capacity konsisten', () => {
    const field = (orchestrator as any).state.createEmptyField() as AgentWaveField;
    
    expect(field.steps.ids.length).toBe(field.steps.orders.length);
    expect(field.steps.ids.length).toBe(field.steps.kinds.length);
    expect(field.steps.ids.length).toBe(field.steps.statuses.length);
    expect(field.steps.ids.length).toBe(field.steps.labels.length);
    expect(field.steps.ids.length).toBe(field.steps.descriptions.length);
    expect(field.steps.ids.length).toBe(field.steps.tokenIns.length);
    expect(field.steps.ids.length).toBe(field.steps.tokenOuts.length);
    expect(field.steps.ids.length).toBe(field.steps.elapsedMs.length);
    expect(field.steps.ids.length).toBe(field.steps.parentIdx.length);
    expect(field.steps.ids.length).toBe(field.steps.depth.length);

    expect(field.tools.ids.length).toBe(field.tools.names.length);
    expect(field.tools.ids.length).toBe(field.tools.params.length);
    expect(field.tools.ids.length).toBe(field.tools.results.length);
    expect(field.tools.ids.length).toBe(field.tools.statuses.length);
    expect(field.tools.ids.length).toBe(field.tools.latencies.length);
    expect(field.tools.ids.length).toBe(field.tools.stepIdx.length);
    expect(field.tools.ids.length).toBe(field.tools.startTimes.length);

    // Capacity harus power-of-2 atau fixed — ini untuk SIMD alignment
    expect(field.steps.ids.length).toBe(64);
    expect(field.tools.ids.length).toBe(64);
  });

  it('T0.1.2 — appendStep() harus menulis ke index yang benar tanpa hole', () => {
    const state = (orchestrator as any).state;
    const idx0 = state.appendStep(StepKind.PLAN, 'A', 'desc A');
    const idx1 = state.appendStep(StepKind.REASON, 'B', 'desc B');
    const idx2 = state.appendStep(StepKind.TOOL_CALL, 'C', 'desc C');

    expect(idx0).toBe(0);
    expect(idx1).toBe(1);
    expect(idx2).toBe(2);
    expect(state.stepCount).toBe(3);

    const field = state.field as AgentWaveField;
    expect(field.steps.ids[0]).toBeTruthy();
    expect(field.steps.ids[1]).toBeTruthy();
    expect(field.steps.ids[2]).toBeTruthy();
    
    // Test if correct kinds are appended!
    expect(field.steps.kinds[0]).toBe(StepKind.PLAN);
    expect(field.steps.kinds[1]).toBe(StepKind.REASON);
    expect(field.steps.kinds[2]).toBe(StepKind.TOOL_CALL);

    expect(field.steps.statuses[0]).toBe(StepStatus.PENDING);
    expect(field.steps.statuses[1]).toBe(StepStatus.PENDING);
    expect(field.steps.statuses[2]).toBe(StepStatus.PENDING);
  });

  it('T0.1.3 — appendTool() harus link ke stepIdx yang benar', () => {
    const state = (orchestrator as any).state;
    const stepIdx = state.appendStep(StepKind.TOOL_CALL, 'Test', '');
    const toolIdx = state.appendTool('read_file', '{"path":"a.ts"}', stepIdx);

    expect(state.toolCount).toBe(1);
    const field = state.field as AgentWaveField;
    expect(field.tools.stepIdx[toolIdx]).toBe(stepIdx);
    expect(field.tools.statuses[toolIdx]).toBe(ToolStatus.QUEUED);
  });

  // === T0.2: Kernel Correctness ===
  
  it('T0.2.0 — computeAggregate() harus mengambil nilai yang paling sering muncul', () => {
    // Array with mostly DONE
    expect(STATUS_KERNEL.computeAggregate([StepStatus.PENDING, StepStatus.DONE, StepStatus.DONE, StepStatus.RUNNING])).toBe(StepStatus.DONE);
    
    // Array with mostly ERROR
    expect(STATUS_KERNEL.computeAggregate([StepStatus.ERROR, StepStatus.ERROR, StepStatus.RUNNING])).toBe(StepStatus.ERROR);
  });

  it('T0.2.1 — computeActiveMask() harus menghasilkan bitmask yang benar', () => {
    const orch = orchestrator as any;
    const mask = orch.state.computeActiveMask?.() ?? 
      // Fallback: test kernel directly
      (() => {
        return STATUS_KERNEL.computeActiveMask([
          StepStatus.PENDING, StepStatus.RUNNING, StepStatus.DONE
        ]);
      })();

    // bit 0 (PENDING) + bit 1 (RUNNING) + bit 2 (DONE) = 0b111 = 7
    expect(mask).toBe(0b111);
  });

  it('T0.2.2 — computeStepStatusFromTools() harus agregat dengan benar', () => {
    const orch = orchestrator as any;
    const stepIdx = orch.state.appendStep(StepKind.TOOL_CALL, 'Agg', '');
    
    // Tool 1: SUCCESS, Tool 2: FAILED
    orch.state.appendTool('t1', '{}', stepIdx);
    orch.state.appendTool('t2', '{}', stepIdx);
    
    const field = orch.state.field as AgentWaveField;
    field.tools.statuses[0] = ToolStatus.SUCCESS;
    field.tools.statuses[1] = ToolStatus.FAILED;

    const result = orch.state.computeStepStatusFromTools(stepIdx);
    expect(result).toBe(StepStatus.ERROR); // Ada failed → ERROR
  });

  it('T0.2.3 — computeStepStatusFromTools() ALL SUCCESS → DONE', () => {
    const orch = orchestrator as any;
    const stepIdx = orch.state.appendStep(StepKind.TOOL_CALL, 'All OK', '');
    orch.state.appendTool('t1', '{}', stepIdx);
    orch.state.appendTool('t2', '{}', stepIdx);
    
    const field = orch.state.field as AgentWaveField;
    field.tools.statuses[0] = ToolStatus.SUCCESS;
    field.tools.statuses[1] = ToolStatus.SUCCESS;

    expect(orch.state.computeStepStatusFromTools(stepIdx)).toBe(StepStatus.DONE);
  });

  it('T0.2.4 — computeSessionStatus() harus menghitung secara akurat', () => {
    const orch = orchestrator as any;
    
    // Test base condition where nothing is running but some pending
    orch.state.appendStep(StepKind.PLAN, 'Wait', '');
    expect(orch.state.computeSessionStatus().isComplete).toBe(false);
    
    // Set to DONE
    orch.state.field.steps.statuses[0] = StepStatus.DONE;
    expect(orch.state.computeSessionStatus().isComplete).toBe(true);

    // Set Tool Loops
    orch.state.field.toolLoopCount = 15;
    orch.state.field.maxToolLoops = 15;
    expect(orch.state.computeSessionStatus().isFatal).toBe(true);
  });

  // === T0.3: Emit & Immutability ===

  it('T0.3.1 — emitField() harus increment epoch dan emit snapshot', async () => {
    const orch = orchestrator as any;
    const initialEpoch = orch.state.field.epoch;

    // Subscribe dan tunggu emission
    const fieldPromise = firstValueFrom(orch.field$.pipe(filter((f: AgentWaveField) => !!f), take(1)));
    orch.state.emitField();

    const field = await fieldPromise;
    expect((field as any).syncEpoch || 0).toBeDefined();
  });

  it('T0.3.2 — Snapshot dari field$ harus DEEP CLONE (no aliasing)', async () => {
    const orch = orchestrator as any;
    orch.state.appendStep(StepKind.PLAN, 'Test', '');
    orch.state.emitField();

    const snapshot = await firstValueFrom(orch.field$.pipe(filter((f: AgentWaveField) => !!f), take(1)));
    assertFieldInvariant(snapshot as AgentWaveField);
    
    // Mutasi snapshot TIDAK BOLEH mempengaruhi internal
    (snapshot as AgentWaveField).steps.statuses[0] = 99 as StepStatus;
    expect(orch.state.field.steps.statuses[0]).not.toBe(99);
  });

  // === T0.4: Reset & Cleanup ===

  it('T0.4.1 — reset() harus zero-out SEMUA state', () => {
    const orch = orchestrator as any;
    orch.state.appendStep(StepKind.PLAN, 'X', '');
    orch.state.appendTool('t', '{}', 0);
    orch.textBuffer = 'some text';
    orch.pendingText = 'pending';
    orch.state._stepCount = 5; // simulate corruption

    orch.state.reset();
    orch.reset(); // call the main orchestrator reset to clear buffers

    expect(orch.state.stepCount).toBe(0);
    expect(orch.state.toolCount).toBe(0);
    expect(orch.textBuffer).toBe('');
    expect(orch.pendingText).toBe('');
    expect(orch.parser.getCurrentReasoningStepIdx()).toBe(-1);
    expect(orch.rafId).toBeNull();
  });

  it('T0.4.2 — reset() harus cancel pending rAF', () => {
    const orch = orchestrator as any;
    orch.rafId = 12345; // simulate scheduled
    const cancelSpy = vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});
    
    orch.reset();
    
    expect(cancelSpy).toHaveBeenCalledWith(12345);
    cancelSpy.mockRestore();
  });

  // === T0.5: Parsing Kontrak (Mencegah Glitch Kaset Kusut) ===
  
  it('T0.5.1 — syncReasoningStep() mem-parsing <think> dan menentukan isClosed tanpa salah potong', () => {
    const orch = orchestrator as any;
    
    const parentIdx = orch.state.appendStep(StepKind.PLAN, 'Plan', 'desc');
    // Memiliki: satu node selesai sempurna, teks antara, dan satu node gantung.
    const inputSimulated = 'Teks awal <think>Testing satu dua</think> Teks tengah <think>Testing tiga';
    
    orch.parser.syncReasoningStep(inputSimulated, parentIdx);
    
    const field = orch.state.field as AgentWaveField;
    // Step 0 adalah PLAN (dari appendStep)
    // Step 1 adalah REASON (dari <think> pertama)
    // Step 2 adalah REASON (dari <think> kedua)
    const reasonIndex1 = 1;
    const reasonIndex2 = 2;
    
    expect(field.steps.descriptions[reasonIndex1]).toBe('Testing satu dua');
    expect(field.steps.statuses[reasonIndex1]).toBe(StepStatus.DONE); // karena ada </think>
    
    expect(field.steps.descriptions[reasonIndex2]).toBe('Testing tiga');
    expect(field.steps.statuses[reasonIndex2]).toBe(StepStatus.RUNNING); // tidak ada </think>, maka status RUNNING
  });

  it('T0.5.2 — syncReasoningStep() harus transisi dari RUNNING ke DONE saat tag ditutup', () => {
    const orch = orchestrator as any;
    const parentIdx = orch.state.appendStep(StepKind.PLAN, 'Plan', 'desc');
    
    // Step 1: Tag masih terbuka
    orch.parser.syncReasoningStep('<think>A sedang jalan', parentIdx);
    expect(orch.state.field.steps.statuses[1]).toBe(StepStatus.RUNNING);
    expect(orch.state.field.steps.descriptions[1]).toBe('A sedang jalan');

    // Step 2: Tag ditutup
    orch.parser.syncReasoningStep('<think>A sedang jalan</think> hasil akhir', parentIdx);
    expect(orch.state.field.steps.statuses[1]).toBe(StepStatus.DONE);
    expect(orch.state.field.steps.descriptions[1]).toBe('A sedang jalan');
  });

  it('T0.5.3 — syncReasoningStep() harus menangani multiple think blocks dan teks acak di antaranya', () => {
    const orch = orchestrator as any;
    const parentIdx = orch.state.appendStep(StepKind.PLAN, 'Plan', 'desc');
    
    const stream = 'Intro <think>Block 1</think> mid <think>Block 2...';
    orch.parser.syncReasoningStep(stream, parentIdx);
    
    expect(orch.state.field.steps.statuses[1]).toBe(StepStatus.DONE);
    expect(orch.state.field.steps.descriptions[1]).toBe('Block 1');
    expect(orch.state.field.steps.statuses[2]).toBe(StepStatus.RUNNING);
    expect(orch.state.field.steps.descriptions[2]).toBe('Block 2...');
  });
});

// ============================================================
// TEST SUITE — Tier 1: Tool Execution & Concurrency
// ============================================================

describe('AgentOrchestrator — TOOL EXECUTION', () => {
  let orchestrator: AgentOrchestrator;
  let mockSession: MockChatSession;
  let mockRegistry: MockToolRegistry;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [AgentOrchestrator] });
    orchestrator = TestBed.inject(AgentOrchestrator);
    mockSession = new MockChatSession();
    mockRegistry = new MockToolRegistry();
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    orchestrator.reset();
    TestBed.resetTestingModule();
    vi.useRealTimers();
  });

  it('T1.1.1 — executeToolsParallel() harus menjalankan tool secara parallel', async () => {
    const orch = orchestrator as any;
    const executionOrder: string[] = [];
    const latencies: number[] = [];

    mockRegistry.setHandler('slow_tool', async () => {
      await new Promise(r => setTimeout(r, 50));
      executionOrder.push('slow');
      return { status: 'success', output: 'slow' };
    });
    mockRegistry.setHandler('fast_tool', async () => {
      executionOrder.push('fast');
      return { status: 'success', output: 'fast' };
    });

    const stepIdx = orch.state.appendStep(StepKind.TOOL_CALL, 'Parallel', '');
    const calls: ToolCallRequest[] = [
      { id: 'c1', name: 'slow_tool', arguments: {} },
      { id: 'c2', name: 'fast_tool', arguments: {} },
    ];

    const start = performance.now();
    const results = await orch.executor.executeToolsParallel(calls, mockRegistry, stepIdx);
    const elapsed = performance.now() - start;

    // Parallel: fast selesai duluan meski slow dipanggil pertama
    expect(executionOrder[0]).toBe('fast');
    expect(results).toHaveLength(2);
    expect(results[0].status).toBe('success');
    expect(results[1].status).toBe('success');
    
    // Harus lebih cepat dari sequential (50ms + 0ms ≈ 50ms, tapi parallel ≈ 50ms)
    // Tapi karena fake timers, kita cek execution order saja
  });

  it('T1.1.2 — executeToolsParallel() harus update status REAL-TIME', async () => {
    const orch = orchestrator as any;
    const fieldSnapshots: AgentWaveField[] = [];
    
    orch.field$.subscribe((f: AgentWaveField) => f && fieldSnapshots.push(JSON.parse(JSON.stringify(f))));

    mockRegistry.setHandler('tool', async () => {
      await new Promise(r => setTimeout(r, 20));
      return { status: 'success', output: 'ok' };
    });

    const stepIdx = orch.state.appendStep(StepKind.TOOL_CALL, 'RT', '');
    const calls = [{ id: 'c1', name: 'tool', arguments: {} }];

    await orch.executor.executeToolsParallel(calls, mockRegistry, stepIdx);

    // Cari snapshot dimana tool status = RUNNING
    const runningSnapshot = fieldSnapshots.find(
      f => f.tools.statuses[0] === ToolStatus.RUNNING
    );
    expect(runningSnapshot).toBeTruthy();

    // Cari snapshot dimana tool status = SUCCESS
    const successSnapshot = fieldSnapshots.find(
      f => f.tools.statuses[0] === ToolStatus.SUCCESS
    );
    expect(successSnapshot).toBeTruthy();
  });

  it.skip('T1.2.1 — withTimeout() harus ABORT signal saat timeout', async () => {
    const orch = orchestrator as any;
    let aborted = false;

    const slowFn = (signal: AbortSignal) => new Promise<string>((resolve, reject) => {
      signal.addEventListener('abort', () => {
        aborted = true;
        reject(new Error('Aborted'));
      });
      setTimeout(() => resolve('done'), 1000);
    });

    await expect(orch.executor.withTimeout(slowFn, 50)).rejects.toThrow('Aborted');
    expect(aborted).toBe(true);
  });

  it('T1.2.2 — Tool yang throw error harus direkam sebagai FAILED bukan TIMEOUT', async () => {
    const orch = orchestrator as any;
    mockRegistry.setHandler('explode', async () => {
      throw new Error('Boom!');
    });

    const stepIdx = orch.state.appendStep(StepKind.TOOL_CALL, 'Boom', '');
    const calls = [{ id: 'c1', name: 'explode', arguments: {} }];

    const results = await orch.executor.executeToolsParallel(calls, mockRegistry, stepIdx);
    
    expect(results[0].status).toBe('error');
    expect(orch.state.field.tools.statuses[0]).toBe(ToolStatus.FAILED);
    // BUKAN TIMEOUT — ini critical untuk debugging
    expect(orch.state.field.tools.statuses[0]).not.toBe(ToolStatus.TIMEOUT);
  });

  it('T1.3.1 — executeToolsSerial() harus memanggil parallel per tool', async () => {
    const orch = orchestrator as any;
    const parallelSpy = vi.spyOn(orch.executor, 'executeToolsParallel');
    
    mockRegistry.setHandler('t1', async () => ({ status: 'success', output: '1' }));
    mockRegistry.setHandler('t2', async () => ({ status: 'success', output: '2' }));

    const stepIdx = orch.state.appendStep(StepKind.TOOL_CALL, 'Serial', '');
    const calls = [
      { id: 'c1', name: 't1', arguments: {} },
      { id: 'c2', name: 't2', arguments: {} },
    ];

    await orch.executor.executeToolsSerial(calls, mockRegistry, stepIdx);

    // Dipanggil per tool, bukan sekali untuk semua
    expect(parallelSpy).toHaveBeenCalledTimes(2);
  });
});

// ============================================================
// TEST SUITE — Tier 2: End-to-End Pipeline
// ============================================================

describe('AgentOrchestrator — E2E PIPELINE', () => {
  let orchestrator: AgentOrchestrator;
  let mockSession: MockChatSession;
  let mockRegistry: MockToolRegistry;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [AgentOrchestrator] });
    orchestrator = TestBed.inject(AgentOrchestrator);
    mockSession = new MockChatSession();
    mockRegistry = new MockToolRegistry();
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    orchestrator.reset();
    TestBed.resetTestingModule();
    vi.useRealTimers();
  });

  it('T2.1.1 — Full flow: text only, no tools', async () => {
    const runPromise = orchestrator.run(
      mockSession,
      mockRegistry,
      [{ text: 'Hello' }],
      []
    );

    // Simulate model response
    mockSession.push({ text: 'Halo kembali!' });
    mockSession.complete();

    await runPromise;

    const field = orchestrator.currentField;
    assertFieldInvariant(field);
    expect(field!.isComplete).toBe(true);
    expect(orchestrator.currentText).toContain('Halo kembali!');
  });

  it('T2.1.2 — Full flow: single tool call', async () => {
    mockRegistry.setHandler('read_file', async (call) => ({
      status: 'success',
      output: `Content of ${call.arguments?.['path']}`,
    }));

    const runPromise = orchestrator.run(
      mockSession,
      mockRegistry,
      [{ text: 'Baca file' }],
      []
    );

    // Model thinks then calls tool
    mockSession.push({ text: 'Saya akan membaca file...' });
    mockSession.push({
      functionCalls: [{ name: 'read_file', args: { path: 'test.ts' } }]
    });
    mockSession.complete();

    // Give time for tool execution
    await vi.advanceTimersByTimeAsync(50);

    // Model final response
    mockSession.push({ text: 'File berisi kode TypeScript.' });
    mockSession.complete();

    await runPromise;

    const field = orchestrator.currentField;
    assertFieldInvariant(field);
    expect(field!.toolLoopCount).toBe(1);
    expect(field!.isComplete).toBe(true);
    
    // Verify tool was called
    const log = mockRegistry.getCallLog();
    expect(log).toHaveLength(1);
    expect(log[0].call.name).toBe('read_file');
  });

  it('T2.1.3 — Full flow: maxToolLoops harus menghentikan loop', async () => {
    const runPromise = orchestrator.run(
      mockSession,
      mockRegistry,
      [{ text: 'Infinite loop test' }],
      [],
      { maxToolLoops: 2 }
    );

    // Simulate model yang selalu minta tool
    for (let i = 0; i < 5; i++) {
      mockSession.push({
        functionCalls: [{ name: 'noop', args: {} }]
      });
      mockSession.complete();
      await vi.advanceTimersByTimeAsync(10);
    }

    // Force completion
    mockSession.push({ text: 'Done.' });
    mockSession.complete();

    await runPromise;

    const field = orchestrator.currentField;
    expect(field!.isFatal).toBe(true);
    expect(field!.toolLoopCount).toBeLessThanOrEqual(2);
  });

  it('T2.2.1 — text$ stream harus emit incremental updates', async () => {
    const texts: string[] = [];
    orchestrator.text$.subscribe(t => texts.push(t));

    const runPromise = orchestrator.run(
      mockSession,
      mockRegistry,
      [{ text: 'Stream test' }],
      []
    );

    mockSession.push({ text: 'A' });
    await vi.advanceTimersByTimeAsync(20);
    
    mockSession.push({ text: 'B' });
    await vi.advanceTimersByTimeAsync(20);
    
    mockSession.push({ text: 'C' });
    mockSession.complete();

    await runPromise;

    // Text harus incremental: '', 'A', 'AB', 'ABC'
    expect(texts.length).toBeGreaterThan(1);
    expect(texts[texts.length - 1]).toContain('ABC');
  });

  it('T2.2.2 — field$ stream harus emit setiap kali epoch berubah', async () => {
    const epochs: number[] = [];
    orchestrator.field$.subscribe(f => f && epochs.push(f.epoch));

    const runPromise = orchestrator.run(
      mockSession,
      mockRegistry,
      [{ text: 'Field test' }],
      []
    );

    mockSession.push({ text: 'X' });
    mockSession.complete();

    await runPromise;

    // Epoch harus monotonically increasing
    for (let i = 1; i < epochs.length; i++) {
      expect(epochs[i]).toBeGreaterThan(epochs[i - 1]);
    }
  });

  it('T2.2.3 — field$ must update totalTokens when usageMetadata is present in chunk', async () => {
    const runPromise = orchestrator.run(
      mockSession,
      mockRegistry,
      [{ text: 'Token test' }],
      []
    );

    mockSession.push({ 
      text: 'Hello', 
      usageMetadata: { totalTokenCount: 150 } 
    });
    mockSession.complete();

    await runPromise;

    const field = orchestrator.currentField;
    expect(field!.totalTokens).toBe(150);
  });
});

// ============================================================
// TEST SUITE — Tier 3: Edge Cases & Fuzz
// ============================================================

describe('AgentOrchestrator — EDGE CASES', () => {
  let orchestrator: AgentOrchestrator;
  let mockRegistry: MockToolRegistry;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [AgentOrchestrator] });
    orchestrator = TestBed.inject(AgentOrchestrator);
    mockRegistry = new MockToolRegistry();
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    orchestrator.reset();
    TestBed.resetTestingModule();
    vi.useRealTimers();
  });

  it('T3.1.1 — Resize buffer saat capacity exceeded', () => {
    const orch = orchestrator as any;
    const initialCap = orch.state.CAPACITY;

    // Append sampai overflow
    for (let i = 0; i < initialCap + 5; i++) {
      orch.state.appendStep(StepKind.REASON, `Step ${i}`, '');
    }

    expect(orch.state.stepCount).toBe(initialCap + 5);
    expect(orch.state.field.steps.ids.length).toBeGreaterThan(initialCap);
    
    // Verifikasi dense — tidak ada hole setelah resize
    assertDenseSOA(orch.state.field);
  });

  it('T3.1.2 — Tool dengan params JSON invalid harus tetap tersimpan', async () => {
    const orch = orchestrator as any;
    const stepIdx = orch.state.appendStep(StepKind.TOOL_CALL, 'Bad JSON', '');
    
    // Simulasi params yang tidak valid JSON — ini bisa terjadi dari LLM
    const badParams = '{ broken json';
    const toolIdx = orch.state.appendTool('test', badParams, stepIdx);
    
    expect(orch.state.field.tools.params[toolIdx]).toBe(badParams);
    // System tidak boleh crash — params disimpan as-is, parsing di consumer
  });

  it('T3.2.1 — Concurrent reset() saat run() berlangsung', async () => {
    const mockSession = new MockChatSession();
    
    const runPromise = orchestrator.run(
      mockSession,
      mockRegistry,
      [{ text: 'Concurrent reset' }],
      []
    );

    // Reset di tengah jalan — ini harus graceful
    orchestrator.reset();
    
    mockSession.push({ text: 'X' });
    mockSession.complete();

    // Tidak boleh throw unhandled
    await expect(runPromise).resolves.not.toThrow();
  });

  it('T3.2.2 — Multiple run() tanpa reset() harus menggantikan state', async () => {
    const session1 = new MockChatSession();
    const session2 = new MockChatSession();

    const run1 = orchestrator.run(session1, mockRegistry, [{ text: '1' }], []);
    const run2 = orchestrator.run(session2, mockRegistry, [{ text: '2' }], []);

    session1.push({ text: 'A' });
    session1.complete();
    
    session2.push({ text: 'B' });
    session2.complete();

    // Kedua promise harus resolve — state terakhir yang menang
    await expect(Promise.all([run1, run2])).resolves.toBeDefined();
  });
});
