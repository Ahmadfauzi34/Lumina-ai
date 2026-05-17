import type { TaskTypeDefinition, TaskPhase, TaskCheckpoint, TaskAction, TaskResult } from './task-types';

// ============================================================
// TASK HANDLER — Plugin interface untuk concrete implementations
// ============================================================

export interface TaskPhaseContext {
  taskId: string;
  typeId: string;
  args: Record<string, unknown>;
  currentPhase: TaskPhase;
  previousCheckpoints: TaskCheckpoint[];
  signal: AbortSignal;
  
  // Progress reporting (pre-allocated callback, no closure alloc di hot path)
  reportProgress: (current: number, total: number, label: string, detail?: string) => void;
  
  // Artifact registration
  registerArtifact: (artifact: {
    name: string;
    type: string;
    path?: string;
    content?: string;
    size?: number;
  }) => string; // Returns artifact ID
  
  // User action request (untuk awaiting_input phase)
  requestUserAction: (actions: TaskAction[]) => Promise<string>; // Returns action ID
  
  // Sub-task delegation (nested)
  delegateSubTask: (typeId: string, args: Record<string, unknown>) => Promise<TaskResult>;
}

export interface TaskHandler {
  definition: TaskTypeDefinition;
  
  // Phase execution — branchless dispatch via Map di registry
  executePhase: (
    phase: TaskPhase,
    ctx: TaskPhaseContext
  ) => Promise<{
    nextPhase: TaskPhase;
    output?: string;
    checkpoint?: boolean; // Auto-save checkpoint setelah phase ini
  }>;
  
  // Validation apakah task bisa di-handle dengan args ini
  canHandle: (args: Record<string, unknown>) => boolean;
  
  // Estimate complexity untuk progress bar (0-100)
  estimateComplexity: (args: Record<string, unknown>) => number;
}
