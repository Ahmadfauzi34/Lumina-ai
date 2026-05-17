// ============================================================
// TENSOR-DRIVEN TOOL TYPES
// Mengadopsi SOA (Structure of Arrays) untuk metadata
// ============================================================

export type ToolStatus = 'success' | 'error' | 'timeout' | 'cancelled' | 'pending';

export interface ToolParameter {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  description: string;
  required: boolean;
  default?: unknown;
  enum?: string[];
  items?: { type: string; properties?: Record<string, { type: string }> };
}

// SOA: Pisahkan definisi (cold) dari executor (hot)
export interface ToolDefinition {
  name: string;
  description: string;
  parameters: ToolParameter[];
  // Metadata untuk routing & circuit breaker
  routing: {
    priority: number;        // 0-10, higher = execute first
    timeoutMs: number;       // default timeout
    retryable: boolean;      // bisa retry?
    maxRetries: number;
    cacheable: boolean;      // hasil bisa di-cache?
    cacheTtlMs: number;
  };
}

export interface ToolExecutionContext {
  requestId: string;
  toolName: string;
  args: Record<string, unknown>;
  startTime: number;
  abortSignal?: AbortSignal;
  // Pre-allocated buffer untuk metadata
  metadata: Map<string, unknown>;
}

export interface ToolResult {
  status: ToolStatus;
  output: string;
  // SOA: Pisahkan data dari metadata
  data?: unknown;
  metadata: {
    toolName: string;
    executionTimeMs: number;
    attemptCount: number;
    cached: boolean;
    truncated: boolean;
    // Error classification
    errorType?: 'validation' | 'network' | 'timeout' | 'runtime' | 'cancelled' | 'unknown';
    errorCode?: string;
    _structured?: Record<string, unknown>;
  };
}

// Tool Registry menggunakan enum dispatch alih-alih Box<dyn Trait>
export interface ToolRegistryEntry {
  definition: ToolDefinition;
  executor: ToolExecutor;
}

export type ToolExecutor = (ctx: ToolExecutionContext) => Promise<ToolResult>;

// Pipeline stages untuk observability
export type PipelineStage = 
  | 'validate' 
  | 'cache_check' 
  | 'execute' 
  | 'retry' 
  | 'cache_store' 
  | 'complete';
