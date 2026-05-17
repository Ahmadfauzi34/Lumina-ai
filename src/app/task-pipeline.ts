import { BehaviorSubject, Subject } from 'rxjs';
import type { 
  TaskTypeDefinition, 
  TaskPhase, 
  TaskStateSOA, 
  TaskArtifactSOA,
  TaskCheckpoint,
  TaskResult,
  TaskAction 
} from './task-types';
import type { TaskHandler, TaskPhaseContext } from './task-handler';
import { toolPipeline } from './tools/implementations/tool-pipeline';

// ============================================================
// TASK PIPELINE — Orchestrator untuk long-running tasks
// Paralel dengan ToolPipeline, tapi untuk multi-phase execution
// ============================================================

const TASK_CONFIG = {
  MAX_CONCURRENT_TASKS: 3,
  CHECKPOINT_RETENTION: 10, // Max checkpoints per task
  PROGRESS_DEBOUNCE_MS: 100,
} as const;

interface ActiveTask {
  id: string;
  handler: TaskHandler;
  args: Record<string, unknown>;
  abortController: AbortController;
  checkpoints: TaskCheckpoint[];
  artifacts: Map<string, any>;
  startTime: number;
  currentPhaseIdx: number;
}

export class TaskPipeline {
  private handlers = new Map<string, TaskHandler>();
  private activeTasks = new Map<string, ActiveTask>();
  private taskQueue: string[] = [];
  
  // SOA State (pre-allocated, resizable)
  private state: TaskStateSOA = this.createEmptyState();
  private artifacts: TaskArtifactSOA = this.createEmptyArtifacts();
  
  // Streams
  private stateSubject = new BehaviorSubject<TaskStateSOA | null>(null);
  readonly state$ = this.stateSubject.asObservable();
  
  private progressSubject = new Subject<{ taskId: string; current: number; total: number; label: string; detail?: string }>();
  readonly progress$ = this.progressSubject.asObservable();
  
  registerHandler(handler: TaskHandler): void {
    this.handlers.set(handler.definition.id, handler);
  }
  
  getAvailableTasks(): TaskTypeDefinition[] {
    return Array.from(this.handlers.values())
      .filter(h => h.definition.status === 'available')
      .map(h => h.definition);
  }
  
  async startTask(
    typeId: string,
    args: Record<string, unknown>,
    taskId = `task-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
  ): Promise<TaskResult> {
    const handler = this.handlers.get(typeId);
    if (!handler) {
      throw new Error(`Task type "${typeId}" tidak ditemukan.`);
    }
    
    if (!handler.canHandle(args)) {
      throw new Error(`Task ${typeId} cannot handle provided arguments.`);
    }
    
    // Check concurrency limit
    if (this.activeTasks.size >= TASK_CONFIG.MAX_CONCURRENT_TASKS) {
      this.taskQueue.push(taskId);
      // Wait until slot available
      await this.waitForSlot(taskId);
    }
    
    const abortController = new AbortController();
    const activeTask: ActiveTask = {
      id: taskId,
      handler,
      args,
      abortController,
      checkpoints: [],
      artifacts: new Map(),
      startTime: performance.now(),
      currentPhaseIdx: 0,
    };
    
    this.activeTasks.set(taskId, activeTask);
    this.appendTaskToState(taskId, handler.definition);
    
    try {
      const result = await this.runPhases(activeTask);
      return result;
    } finally {
      this.activeTasks.delete(taskId);
      this.processQueue();
    }
  }
  
  private async runPhases(task: ActiveTask): Promise<TaskResult> {
    const { handler, args, id, abortController } = task;
    const phases = handler.definition.phases;
    let currentPhase: TaskPhase = phases[0];
    let output = '';
    
    // Pre-allocate context object (avoid allocation di loop)
    const ctx: TaskPhaseContext = {
      taskId: id,
      typeId: handler.definition.id,
      args,
      currentPhase,
      previousCheckpoints: task.checkpoints,
      signal: abortController.signal,
      reportProgress: (c, t, l, d) => this.reportProgress(id, c, t, l, d),
      registerArtifact: (a) => this.registerArtifact(id, a),
      requestUserAction: (actions) => this.requestUserAction(id, actions),
      delegateSubTask: (typeId, subArgs) => this.startTask(typeId, subArgs),
    };
    
    while (currentPhase !== 'completed' && currentPhase !== 'cancelled' && currentPhase !== 'error') {
      if (abortController.signal.aborted) {
        currentPhase = 'cancelled';
        break;
      }
      
      // Update state
      this.updateTaskPhase(id, currentPhase);
      ctx.currentPhase = currentPhase;
      
      // Execute phase
      try {
        const phaseResult = await handler.executePhase(currentPhase, ctx);
        
        output = phaseResult.output || output;
        currentPhase = phaseResult.nextPhase;
        
        // Auto-checkpoint
        if (phaseResult.checkpoint) {
          this.saveCheckpoint(task, currentPhase);
        }
        
      } catch (error) {
        currentPhase = 'error';
        output = `Error in phase ${currentPhase}: ${error instanceof Error ? error.message : String(error)}`;
      }
    }
    
    // Build result
    const endTime = performance.now();
    const artifactList = Array.from(task.artifacts.values());
    
    return {
      taskId: id,
      status: currentPhase === 'completed' ? 'success' : currentPhase === 'cancelled' ? 'cancelled' : 'error',
      output,
      artifacts: artifactList,
      metrics: {
        startTime: task.startTime,
        endTime,
        elapsedMs: Math.round(endTime - task.startTime),
        tokensUsed: 0, // Would integrate with token counting
        toolCalls: 0,
        phaseTransitions: task.checkpoints.length,
      },
      checkpoints: task.checkpoints,
    };
  }
  
  cancelTask(taskId: string): boolean {
    const task = this.activeTasks.get(taskId);
    if (task) {
      task.abortController.abort();
      return true;
    }
    return false;
  }
  
  // Resume dari checkpoint
  async resumeTask(taskId: string, checkpointIdx: number): Promise<TaskResult> {
    const task = this.activeTasks.get(taskId);
    if (!task) throw new Error('Task not active');
    
    const checkpoint = task.checkpoints[checkpointIdx];
    if (!checkpoint) throw new Error('Checkpoint not found');
    
    // Restore state
    task.currentPhaseIdx = task.handler.definition.phases.indexOf(checkpoint.phase);
    
    // Re-run dari checkpoint
    return this.runPhases(task);
  }
  
  private reportProgress(taskId: string, current: number, total: number, label: string, detail?: string): void {
    this.updateTaskProgress(taskId, current, total, label);
    this.progressSubject.next({ taskId, current, total, label, detail });
  }
  
  private registerArtifact(taskId: string, artifact: any): string {
    const task = this.activeTasks.get(taskId);
    if (!task) return '';
    
    const id = `art-${taskId}-${task.artifacts.size}`;
    task.artifacts.set(id, { ...artifact, id });
    this.appendArtifactToState(taskId, id, artifact);
    return id;
  }
  
  private requestUserAction(taskId: string, actions: TaskAction[]): Promise<string> {
    return new Promise((resolve, reject) => {
      const task = this.activeTasks.get(taskId);
      if (!task) {
        reject(new Error('Task not found'));
        return;
      }

      if (task.args['_autoConfirm']) {
        resolve(actions[0].id);
        return;
      }
      
      // Emit action request ke UI via state update
      this.updateTaskActions(taskId, actions);
      
      // Sementara UI button belum di-hook, kita auto-resolve ke action pertama
      console.log(`[Task ${taskId}] Awaiting user input, auto-resolving to '${actions[0].id}' in 2s...`);
      const timer = setTimeout(() => {
        if (!task.abortController.signal.aborted) {
          resolve(actions[0].id);
        }
      }, 2000);

      const checkInterval = setInterval(() => {
        if (task.abortController.signal.aborted) {
          clearTimeout(timer);
          clearInterval(checkInterval);
          reject(new Error('Task cancelled'));
        }
      }, 100);
    });
  }
  
  // ============================================================
  // SOA STATE MANAGEMENT
  // ============================================================
  
  private createEmptyState(): TaskStateSOA {
    const cap = 32;
    return {
      ids: new Array(cap),
      types: new Array(cap),
      phases: new Array(cap),
      progressCurrent: new Array(cap),
      progressTotal: new Array(cap),
      progressLabels: new Array(cap),
      startTimes: new Array(cap),
      elapsedMs: new Array(cap),
      tokenIns: new Array(cap),
      tokenOuts: new Array(cap),
      parentTaskIds: new Array(cap),
      depth: new Array(cap),
    };
  }
  
  private createEmptyArtifacts(): TaskArtifactSOA {
    const cap = 128;
    return {
      ids: new Array(cap),
      taskIds: new Array(cap),
      names: new Array(cap),
      types: new Array(cap),
      paths: new Array(cap),
      sizes: new Array(cap),
      contents: new Array(cap),
      createdAt: new Array(cap),
    };
  }
  
  private appendTaskToState(taskId: string, def: TaskTypeDefinition): void {
    // Find free slot (dense array, no holes)
    let idx = 0;
    while (idx < this.state.ids.length && this.state.ids[idx]) idx++;
    
    if (idx >= this.state.ids.length) this.resizeState();
    
    this.state.ids[idx] = taskId;
    this.state.types[idx] = def.id;
    this.state.phases[idx] = 'queued';
    this.state.progressCurrent[idx] = 0;
    this.state.progressTotal[idx] = 100;
    this.state.progressLabels[idx] = 'Queued...';
    this.state.startTimes[idx] = performance.now();
    this.state.elapsedMs[idx] = 0;
    this.state.tokenIns[idx] = 0;
    this.state.tokenOuts[idx] = 0;
    this.state.parentTaskIds[idx] = '';
    this.state.depth[idx] = 0;
    
    this.emitState();
  }
  
  private updateTaskPhase(taskId: string, phase: TaskPhase): void {
    const idx = this.state.ids.indexOf(taskId);
    if (idx === -1) return;
    this.state.phases[idx] = phase;
    this.emitState();
  }
  
  private updateTaskProgress(taskId: string, current: number, total: number, label: string): void {
    const idx = this.state.ids.indexOf(taskId);
    if (idx === -1) return;
    this.state.progressCurrent[idx] = current;
    this.state.progressTotal[idx] = total;
    this.state.progressLabels[idx] = label;
    this.state.elapsedMs[idx] = Math.round(performance.now() - this.state.startTimes[idx]);
    this.emitState();
  }
  
  private updateTaskActions(taskId: string, actions: TaskAction[]): void {
    // Store actions in a separate map or emit via subject
    // Simplified for this implementation
  }
  
  private appendArtifactToState(taskId: string, artId: string, artifact: any): void {
    let idx = 0;
    while (idx < this.artifacts.ids.length && this.artifacts.ids[idx]) idx++;
    if (idx >= this.artifacts.ids.length) this.resizeArtifacts();
    
    this.artifacts.ids[idx] = artId;
    this.artifacts.taskIds[idx] = taskId;
    this.artifacts.names[idx] = artifact.name;
    this.artifacts.types[idx] = artifact.type;
    this.artifacts.paths[idx] = artifact.path || '';
    this.artifacts.sizes[idx] = artifact.size || 0;
    this.artifacts.contents[idx] = artifact.content || '';
    this.artifacts.createdAt[idx] = Date.now();
    
    this.emitState();
  }
  
  private saveCheckpoint(task: ActiveTask, phase: TaskPhase): void {
    if (task.checkpoints.length >= TASK_CONFIG.CHECKPOINT_RETENTION) {
      task.checkpoints.shift(); // FIFO
    }
    
    task.checkpoints.push({
      phase,
      progress: {
        current: this.state.progressCurrent[this.state.ids.indexOf(task.id)] || 0,
        total: this.state.progressTotal[this.state.ids.indexOf(task.id)] || 100,
        label: this.state.progressLabels[this.state.ids.indexOf(task.id)] || '',
      },
      artifacts: Array.from(task.artifacts.keys()),
      timestamp: Date.now(),
      context: { ...task.args },
    });
  }
  
  private resizeState(): void {
    const old = this.state;
    const newCap = old.ids.length * 2;
    old.ids.length = newCap; old.ids.fill('', old.ids.length / 2, newCap);
    old.types.length = newCap;
    old.phases.length = newCap;
    old.progressCurrent.length = newCap; old.progressCurrent.fill(0, old.progressCurrent.length / 2, newCap);
    old.progressTotal.length = newCap; old.progressTotal.fill(100, old.progressTotal.length / 2, newCap);
    old.progressLabels.length = newCap; old.progressLabels.fill('', old.progressLabels.length / 2, newCap);
    old.startTimes.length = newCap; old.startTimes.fill(0, old.startTimes.length / 2, newCap);
    old.elapsedMs.length = newCap; old.elapsedMs.fill(0, old.elapsedMs.length / 2, newCap);
    old.tokenIns.length = newCap; old.tokenIns.fill(0, old.tokenIns.length / 2, newCap);
    old.tokenOuts.length = newCap; old.tokenOuts.fill(0, old.tokenOuts.length / 2, newCap);
    old.parentTaskIds.length = newCap; old.parentTaskIds.fill('', old.parentTaskIds.length / 2, newCap);
    old.depth.length = newCap; old.depth.fill(0, old.depth.length / 2, newCap);
  }
  
  private resizeArtifacts(): void {
    const old = this.artifacts;
    const newCap = old.ids.length * 2;
    old.ids.length = newCap;
    old.taskIds.length = newCap;
    old.names.length = newCap;
    old.types.length = newCap;
    old.paths.length = newCap;
    old.sizes.length = newCap; old.sizes.fill(0, old.sizes.length / 2, newCap);
    old.contents.length = newCap;
    old.createdAt.length = newCap; old.createdAt.fill(0, old.createdAt.length / 2, newCap);
  }
  
  private emitState(): void {
    // Deep clone untuk immutability
    const snapshot: TaskStateSOA = {
      ids: [...this.state.ids],
      types: [...this.state.types],
      phases: [...this.state.phases],
      progressCurrent: [...this.state.progressCurrent],
      progressTotal: [...this.state.progressTotal],
      progressLabels: [...this.state.progressLabels],
      startTimes: [...this.state.startTimes],
      elapsedMs: [...this.state.elapsedMs],
      tokenIns: [...this.state.tokenIns],
      tokenOuts: [...this.state.tokenOuts],
      parentTaskIds: [...this.state.parentTaskIds],
      depth: [...this.state.depth],
    };
    this.stateSubject.next(snapshot);
  }
  
  private async waitForSlot(taskId: string): Promise<void> {
    return new Promise(resolve => {
      const check = setInterval(() => {
        if (!this.taskQueue.includes(taskId) || this.activeTasks.size < TASK_CONFIG.MAX_CONCURRENT_TASKS) {
          clearInterval(check);
          resolve();
        }
      }, 100);
    });
  }
  
  private processQueue(): void {
    if (this.taskQueue.length > 0 && this.activeTasks.size < TASK_CONFIG.MAX_CONCURRENT_TASKS) {
      // Next task will be picked up by waitForSlot
    }
  }
}

export const taskPipeline = new TaskPipeline();
