// ============================================================
// TASK TYPE DEFINITIONS — SOA untuk Long-Running Tasks
// Analog dengan ToolDefinition tapi untuk multi-phase execution
// ============================================================

export type TaskPhase = 
  | 'queued'        // Menunggu slot eksekusi
  | 'analyzing'     // Scanning, understanding context
  | 'planning'      // Formulating approach
  | 'awaiting_input'// User decision point
  | 'executing'     // Doing the work
  | 'validating'    // Testing, verifying
  | 'presenting'    // Results ready
  | 'completed'     // Final state
  | 'cancelled'     // User/system abort
  | 'error';        // Unrecoverable failure

export type TaskHandlerStatus = 'available' | 'deprecated' | 'experimental';

export interface TaskParameter {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'array' | 'object' | 'file_path';
  description: string;
  required?: boolean;
  enum?: string[];
  items?: { type: string; properties?: Record<string, unknown> };
  default?: unknown;
}

export interface TaskTypeDefinition {
  id: string;
  name: string;
  description: string;
  category: 'code' | 'analysis' | 'generation' | 'testing' | 'migration' | 'custom';
  parameters: TaskParameter[];
  
  // Pipeline routing (identik dengan ToolDefinition.routing)
  routing: {
    timeoutMs: number;      // Total timeout untuk seluruh task
    maxRetries: number;
    cacheable: boolean;
    cacheTtlMs: number;
    parallelPhases: boolean;// Apakah phases bisa paralel
    checkpointInterval: number; // Ms antara auto-checkpoint
  };
  
  // Phase definitions — task ini punya phases apa saja
  phases: TaskPhase[];
  
  // UI metadata
  ui: {
    icon: string;
    color: string;
    showProgressBar: boolean;
    showArtifacts: boolean;
    allowPause: boolean;
  };
  
  status: TaskHandlerStatus;
}

// SOA: Task State (Structure of Arrays untuk SIMD-friendly)
export interface TaskStateSOA {
  ids: string[];
  types: string[];
  phases: TaskPhase[];
  progressCurrent: number[];
  progressTotal: number[];
  progressLabels: string[];
  startTimes: number[];
  elapsedMs: number[];
  tokenIns: number[];
  tokenOuts: number[];
  parentTaskIds: string[];  // Untuk nested tasks
  depth: number[];
}

// Artifact SOA
export interface TaskArtifactSOA {
  ids: string[];
  taskIds: string[];
  names: string[];
  types: string[];
  paths: string[];      // VFS path
  sizes: number[];
  contents: string[];   // Inline preview
  createdAt: number[];
}

export interface TaskAction {
  id: string;
  label: string;
  style: 'primary' | 'secondary' | 'danger';
  icon?: string;
  disabled?: boolean;
}

export interface TaskCheckpoint {
  phase: TaskPhase;
  progress: { current: number; total: number; label: string };
  artifacts: string[];  // Artifact IDs
  timestamp: number;
  context: Record<string, unknown>; // Resume context
}

export interface TaskArtifactResult {
  id: string;
  name: string;
  type: string;
  path?: string;
  content?: string;
  size?: number;
}

export interface TaskResult {
  taskId: string;
  status: 'success' | 'error' | 'cancelled';
  output: string;
  artifacts: TaskArtifactResult[];
  metrics: {
    startTime: number;
    endTime: number;
    elapsedMs: number;
    tokensUsed: number;
    toolCalls: number;
    phaseTransitions: number;
  };
  checkpoints: TaskCheckpoint[];
}
