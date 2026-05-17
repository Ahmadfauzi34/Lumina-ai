export const enum StepStatus {
  PENDING   = 0,
  RUNNING   = 1,
  DONE      = 2,
  ERROR     = 3,
  SKIPPED   = 4,
  RETRYING  = 5,
}

export const enum ToolStatus {
  IDLE      = 0,
  QUEUED    = 1,
  RUNNING   = 2,
  SUCCESS   = 3,
  FAILED    = 4,
  TIMEOUT   = 5,
}

export const enum StepKind {
  PLAN        = 0,
  REASON      = 1,
  TOOL_CALL   = 2,
  OBSERVATION = 3,
  REFLECT     = 4,
  CORRECT     = 5,
  FINAL       = 6,
}

export interface StepSOA {
  ids:          string[];
  orders:       number[];
  kinds:        StepKind[];
  statuses:     StepStatus[];
  labels:       string[];
  descriptions: string[];
  tokenIns:     number[];
  tokenOuts:    number[];
  elapsedMs:    number[];
  parentIdx:    number[];
  depth:        number[];
}

export interface ToolSOA {
  ids:        string[];
  names:      string[];
  params:     string[];
  results:    string[];
  statuses:   ToolStatus[];
  latencies:  number[];
  stepIdx:    number[];
  startTimes: number[];
}

export interface AgentWaveField {
  epoch: number;
  totalTokens: number;
  tokenLimit: number;
  toolLoopCount: number;
  maxToolLoops: number;
  isComplete: boolean;
  isFatal: boolean;
  steps: StepSOA;
  tools: ToolSOA;
}

export interface ToolCallRequest {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface ToolCallResult {
  status: 'success' | 'error' | 'pending';
  output: string;
  metadata?: Record<string, unknown>;
}

export interface ToolRegistry {
  execute(call: ToolCallRequest, signal?: AbortSignal): Promise<ToolCallResult>;
}

export interface StreamChunk {
  text?: string;
  functionCalls?: { name: string; args: Record<string, unknown> }[];
  usageMetadata?: { candidatesTokenCount?: number; promptTokenCount?: number; totalTokenCount?: number };
  candidates?: { content?: { parts?: { text?: string; thought?: string; functionCall?: { name: string; args: Record<string, unknown> }, executableCode?: { code: string }, codeExecutionResult?: { output: string } }[] } }[];
}

export interface ChatSession {
  sendMessageStream(opts: { message: unknown }): Promise<AsyncGenerator<StreamChunk, void, unknown>>;
}

export interface OrchestratorConfig {
  model: string;
  maxToolLoops: number;
  toolTimeoutMs: number;
  tokenLimit: number;
  parallelTools: boolean;
}

export interface OrchestratorSnapshot {
  field: AgentWaveField;
  textBuffer: string;
}

export interface StatusKernel {
  computeAggregate(statuses: StepStatus[]): StepStatus;
  computeActiveMask(statuses: StepStatus[]): number;
}
