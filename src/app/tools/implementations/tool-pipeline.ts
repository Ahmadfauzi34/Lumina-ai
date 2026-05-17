import type { 
  ToolExecutionContext, 
  ToolResult, 
  ToolRegistryEntry,
  ToolDefinition,
  PipelineStage 
} from './types';

// ============================================================
// PIPELINE CONFIGURATION — Fine-tuned
// ============================================================

const PIPELINE_CONFIG = {
  // Timeouts — tiered berdasarkan tool complexity
  DEFAULT_TIMEOUT: 30000,
  TIMEOUT_TIERS: {
    instant: 5000,      // System info, memory read
    fast: 15000,        // File operations, search
    standard: 30000,    // Code execution, sub-agent
    slow: 60000,        // Batch operations, heavy analysis
    extended: 120000,   // Long-running tasks
  },
  
  // Retry — exponential backoff dengan jitter
  MAX_RETRIES: 2,
  RETRY_BACKOFF_BASE: 1000,
  RETRY_JITTER_MAX: 500,  // Random delay 0-500ms untuk prevent thundering herd
  
  // Circuit Breaker — adaptive threshold
  CIRCUIT_BREAKER: {
    threshold: 5,           // Failures sebelum open
    resetTimeoutMs: 30000,  // Half-open after 30s
    halfOpenMaxCalls: 2,    // Max calls in half-open state
    successThreshold: 2,    // Successes needed to close
  },
  
  // Cache — LRU dengan TTL tiered
  CACHE_SIZE: 100,
  CACHE_TTL: {
    volatile: 5000,     // System info, time
    short: 15000,       // File listing, search results
    medium: 60000,      // Code execution results
    long: 300000,       // Static data, definitions
    permanent: 0,       // No expiry (use sparingly)
  },
  
  // Rate Limiting — token bucket style
  RATE_LIMIT: {
    minDelayMs: 500,      // Minimum antar request
    burstAllowance: 3,    // Allow 3 rapid requests then throttle
    cooldownMs: 2000,     // Reset burst after 2s idle
  },
  
  // Size Limits
  MAX_CODE_SIZE: 1024 * 1024,
  MAX_STDIN_SIZE: 64 * 1024,
  MAX_OUTPUT_TRUNCATE: 50 * 1024,  // 50KB truncate limit
  
  // Visual Output
  ASCII: {
    maxTableWidth: 100,
    maxCellHeight: 20,    // Max lines per cell
    ellipsis: '…',
    borderStyle: 'single' as const,
  },
} as const;

export interface PipelineMetrics {
  toolName: string;
  totalExecutions: number;
  successCount: number;
  errorCount: number;
  timeoutCount: number;
  circuitOpenCount: number;
  avgExecutionTimeMs: number;
  cacheHitRate: number;
  currentCircuitState: string;
}

// ============================================================
// ADAPTIVE CIRCUIT BREAKER (Enhanced)
// ============================================================

type CircuitState = 0 | 1 | 2; // 0 = closed, 1 = open, 2 = half_open

class AdaptiveCircuitBreaker {
  private state: CircuitState = 0;
  private failures = 0;
  private successes = 0;
  private lastFailureTime = 0;
  private halfOpenCalls = 0;
  private lastSuccessTime = 0;

  constructor(
    private config = PIPELINE_CONFIG.CIRCUIT_BREAKER
  ) {}

  canExecute(): boolean {
    if (this.state === 0) return true;  // closed
    
    if (this.state === 1) {  // open
      const elapsed = Date.now() - this.lastFailureTime;
      if (elapsed > this.config.resetTimeoutMs) {
        this.state = 2;  // half_open
        this.halfOpenCalls = 0;
        return true;
      }
      return false;
    }
    
    // half_open — limit calls
    if (this.halfOpenCalls >= this.config.halfOpenMaxCalls) {
      return false;
    }
    this.halfOpenCalls++;
    return true;
  }

  recordSuccess(): void {
    this.successes++;
    this.lastSuccessTime = Date.now();
    
    if (this.state === 2) {  // half_open
      if (this.successes >= this.config.successThreshold) {
        this.reset();
      }
    } else {
      // Gradual recovery in closed state
      this.failures = Math.max(0, this.failures - 1);
    }
  }

  recordFailure(): void {
    this.failures++;
    this.lastFailureTime = Date.now();
    this.successes = 0;
    
    if (this.state === 2) {  // half_open
      this.state = 1;  // Back to open
    } else if (this.failures >= this.config.threshold) {
      this.state = 1;  // open
    }
  }

  reset(): void {
    this.state = 0;
    this.failures = 0;
    this.successes = 0;
    this.halfOpenCalls = 0;
  }

  getMetrics() {
    return {
      state: ['closed', 'open', 'half_open'][this.state],
      failures: this.failures,
      successes: this.successes,
      uptime: this.lastSuccessTime ? Date.now() - this.lastSuccessTime : 0,
    };
  }
}

// ============================================================
// LRU CACHE (Pre-allocated, bounded)
// ============================================================

class ToolCache {
  private cache = new Map<string, { result: ToolResult; expiry: number }>();
  
  constructor(private maxSize = 100) {}

  get(key: string): ToolResult | undefined {
    const entry = this.cache.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expiry) {
      this.cache.delete(key);
      return undefined;
    }
    // LRU: move to end
    this.cache.delete(key);
    this.cache.set(key, entry);
    return entry.result;
  }

  set(key: string, result: ToolResult, ttlMs: number): void {
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey !== undefined) {
        this.cache.delete(firstKey);
      }
    }
    this.cache.set(key, { result, expiry: Date.now() + ttlMs });
  }

  invalidate(toolName?: string): void {
    if (!toolName) {
      this.cache.clear();
      return;
    }
    for (const [key, entry] of this.cache) {
      if (entry.result.metadata.toolName === toolName) {
        this.cache.delete(key);
      }
    }
  }
}

// ============================================================
// GLOBAL STATE (Singleton per worker thread)
// ============================================================

const globalCache = new ToolCache(PIPELINE_CONFIG.CACHE_SIZE);
const circuitBreakers = new Map<string, AdaptiveCircuitBreaker>();

function getCircuitBreaker(toolName: string): AdaptiveCircuitBreaker {
  let cb = circuitBreakers.get(toolName);
  if (!cb) {
    cb = new AdaptiveCircuitBreaker(PIPELINE_CONFIG.CIRCUIT_BREAKER);
    circuitBreakers.set(toolName, cb);
  }
  return cb;
}

// ============================================================
// PIPELINE EXECUTOR
// ============================================================

export class ToolPipeline {
  private activeExecutions = new Map<string, AbortController>();
  private metrics = new Map<string, {
    executions: number;
    successes: number;
    errors: number;
    timeouts: number;
    circuitOpens: number;
    totalTime: number;
  }>();

  getMetrics(toolName?: string): PipelineMetrics[] {
    if (toolName) {
      const m = this.metrics.get(toolName);
      if (!m) return [];
      return [this.computeMetrics(toolName, m)];
    }
    
    return Array.from(this.metrics.entries()).map(([name, m]) => 
      this.computeMetrics(name, m)
    );
  }

  private computeMetrics(name: string, m: NonNullable<ReturnType<typeof this.metrics.get>>): PipelineMetrics {
    const cb = circuitBreakers.get(name);
    return {
      toolName: name,
      totalExecutions: m.executions,
      successCount: m.successes,
      errorCount: m.errors,
      timeoutCount: m.timeouts,
      circuitOpenCount: m.circuitOpens,
      avgExecutionTimeMs: m.executions > 0 ? Math.round(m.totalTime / m.executions) : 0,
      cacheHitRate: 0, // Would need cache stats
      currentCircuitState: cb ? cb.getMetrics().state : 'none',
    };
  }

  private getOrCreateMetric(toolName: string) {
    let m = this.metrics.get(toolName);
    if (!m) {
      m = { executions: 0, successes: 0, errors: 0, timeouts: 0, circuitOpens: 0, totalTime: 0 };
      this.metrics.set(toolName, m);
    }
    return m;
  }

  async execute(
    toolName: string,
    tool: ToolRegistryEntry,
    args: Record<string, unknown>,
    requestId: string
  ): Promise<ToolResult> {
    const startTime = performance.now();
    const abortController = new AbortController();
    this.activeExecutions.set(requestId, abortController);
    const m = this.getOrCreateMetric(toolName);
    m.executions++;

    // Progress callback via postMessage jika di worker
    const emitProgress = (stage: PipelineStage, message: string) => {
      if (typeof postMessage === 'function') {
        postMessage({
          type: 'tool_progress',
          requestId,
          toolName,
          stage,
          message,
          timestamp: Date.now(),
        });
      }
    };

    try {
      // 1. VALIDATE
      emitProgress('validate', 'Validating parameters...');
      const validation = this.validateArgs(args, tool.definition.parameters);
      if (!validation.valid) {
        m.errors++;
        m.totalTime += performance.now() - startTime;
        return this.buildErrorResult(
          toolName, 
          'validation', 
          validation.error!, 
          startTime,
          'VALIDATION_FAILED'
        );
      }

      // 2. BUILD CONTEXT
      const ctx: ToolExecutionContext = {
        requestId,
        toolName,
        args: validation.sanitized!,
        startTime,
        abortSignal: abortController.signal,
        metadata: new Map(),
      };

      // 3. CACHE CHECK
      if (tool.definition.routing.cacheable) {
        emitProgress('cache_check', 'Checking cache...');
        const cacheKey = this.buildCacheKey(toolName, validation.sanitized!);
        const cached = globalCache.get(cacheKey);
        if (cached) {
          this.activeExecutions.delete(requestId);
          m.successes++;
          m.totalTime += performance.now() - startTime;
          return {
            ...cached,
            metadata: { ...cached.metadata, cached: true, executionTimeMs: Math.round(performance.now() - startTime) }
          };
        }
      }

      // 4. CIRCUIT BREAKER CHECK
      const cb = getCircuitBreaker(toolName);
      if (!cb.canExecute()) {
        this.activeExecutions.delete(requestId);
        m.circuitOpens++;
        m.errors++;
        m.totalTime += performance.now() - startTime;
        return this.buildErrorResult(
          toolName,
          'network',
          'Circuit breaker is OPEN - too many failures',
          startTime,
          'CIRCUIT_OPEN'
        );
      }

      // 5. EXECUTE WITH TIMEOUT & RETRY
      emitProgress('execute', 'Executing tool...');
      let lastError: Error | undefined;
      const maxRetries = tool.definition.routing.retryable 
        ? tool.definition.routing.maxRetries 
        : 0;

      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
          const result = await this.executeWithTimeout(
            tool,
            ctx,
            tool.definition.routing.timeoutMs || PIPELINE_CONFIG.DEFAULT_TIMEOUT
          );

          // Record success
          cb.recordSuccess();

          // Cache successful result
          if (tool.definition.routing.cacheable && result.status === 'success') {
            emitProgress('cache_store', 'Caching result...');
            const cacheKey = this.buildCacheKey(toolName, validation.sanitized!);
            globalCache.set(cacheKey, result, tool.definition.routing.cacheTtlMs!);
          }

          emitProgress('complete', 'Execution complete');
          this.activeExecutions.delete(requestId);
          m.successes++;
          m.totalTime += performance.now() - startTime;
          return result;

        } catch (error) {
          lastError = error instanceof Error ? error : new Error(String(error));
          
          // Don't retry if cancelled
          if (abortController.signal.aborted) {
            m.errors++;
            m.totalTime += performance.now() - startTime;
            return this.buildErrorResult(
              toolName,
              'cancelled',
              'Execution cancelled',
              startTime,
              'ABORTED'
            );
          }

          // Don't retry non-retryable errors
          if (!tool.definition.routing.retryable || attempt === maxRetries) {
            break;
          }

          // Exponential backoff
          const delay = PIPELINE_CONFIG.RETRY_BACKOFF_BASE * Math.pow(2, attempt);
          emitProgress('retry', `Retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries})...`);
          await this.sleep(delay);
        }
      }

      // All retries exhausted
      cb.recordFailure();
      const errorType = lastError?.message?.includes('timeout') ? 'timeout' : 'runtime';
      if (errorType === 'timeout') m.timeouts++;
      else m.errors++;
      m.totalTime += performance.now() - startTime;

      return this.buildErrorResult(
        toolName,
        errorType,
        lastError?.message || 'Execution failed after retries',
        startTime,
        'MAX_RETRIES_EXCEEDED'
      );

    } catch (unexpected) {
      m.errors++;
      m.totalTime += performance.now() - startTime;
      return this.buildErrorResult(
        toolName,
        'unknown',
        `Pipeline error: ${unexpected instanceof Error ? unexpected.message : String(unexpected)}`,
        startTime,
        'PIPELINE_ERROR'
      );
    } finally {
      this.activeExecutions.delete(requestId);
    }
  }

  cancel(requestId: string): boolean {
    const controller = this.activeExecutions.get(requestId);
    if (controller) {
      controller.abort();
      this.activeExecutions.delete(requestId);
      return true;
    }
    return false;
  }

  private validateArgs(
    args: Record<string, unknown>,
    params: ToolDefinition['parameters']
  ): { valid: true; sanitized: Record<string, unknown> } | { valid: false; error: string } {
    const sanitized: Record<string, unknown> = {};
    
    for (const param of params) {
      const value = args[param.name];
      
      if (value === undefined || value === null) {
        if (param.required) {
          return { valid: false, error: `Missing required parameter: ${param.name}` };
        }
        if (param.default !== undefined) {
          sanitized[param.name] = param.default;
        }
        continue;
      }

      // Type validation (branchless dengan lookup table)
      const typeValid = this.validateType(value, param.type);
      if (!typeValid) {
        return { 
          valid: false, 
          error: `Invalid type for ${param.name}: expected ${param.type}, got ${typeof value}` 
        };
      }

      // Sanitization untuk string
      if (param.type === 'string' && typeof value === 'string') {
        sanitized[param.name] = value
          .replace(new RegExp('\\x00', 'g'), '')  // Null bytes
          .trim();
      } else {
        sanitized[param.name] = value;
      }
    }

    return { valid: true, sanitized };
  }

  private validateType(value: unknown, expectedType: string): boolean {
    const typeMap: Record<string, (v: unknown) => boolean> = {
      string: v => typeof v === 'string',
      number: v => typeof v === 'number' && !isNaN(v),
      boolean: v => typeof v === 'boolean',
      array: v => Array.isArray(v),
      object: v => typeof v === 'object' && v !== null && !Array.isArray(v),
    };
    return typeMap[expectedType]?.(value) ?? true;
  }

  private async executeWithTimeout(
    tool: ToolRegistryEntry,
    ctx: ToolExecutionContext,
    timeoutMs: number
  ): Promise<ToolResult> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Execution timeout after ${timeoutMs}ms`));
      }, timeoutMs);

      tool.executor(ctx)
        .then(result => {
          clearTimeout(timer);
          resolve(result);
        })
        .catch(error => {
          clearTimeout(timer);
          reject(error);
        });
    });
  }

  private buildCacheKey(toolName: string, args: Record<string, unknown>): string {
    // Deterministic JSON stringify
    const sorted = Object.keys(args).sort().reduce((acc, key) => {
      acc[key] = args[key];
      return acc;
    }, {} as Record<string, unknown>);
    return `${toolName}:${JSON.stringify(sorted)}`;
  }

  private buildErrorResult(
    toolName: string,
    errorType: NonNullable<ToolResult['metadata']['errorType']>,
    message: string,
    startTime: number,
    errorCode: string
  ): ToolResult {
    return {
      status: 'error',
      output: `Error [${errorCode}]: ${message}`,
      metadata: {
        toolName,
        executionTimeMs: Math.round(performance.now() - startTime),
        attemptCount: 1,
        cached: false,
        truncated: false,
        errorType,
        errorCode,
      },
    };
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Singleton instance
export const toolPipeline = new ToolPipeline();
