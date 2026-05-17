import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { toolPipeline } from '../../tools/implementations/tool-pipeline';
import { agentEventBus } from '../../agent/agent-event-bus';
import { generateId } from '../../utils';

export type TaskPhase = 
  | 'analyzing'
  | 'planning'
  | 'awaiting_input'
  | 'executing'
  | 'validating'
  | 'presenting'
  | 'completed';

export interface InteractiveTask {
  id: string;
  title: string;
  description: string;
  phase: TaskPhase;
  progress?: {
    current: number;
    total: number;
    label: string;
    detail?: string;
  };
  actions?: {
    id: string;
    label: string;
    style: 'primary' | 'secondary' | 'danger';
    icon?: string;
    disabled?: boolean;
  }[];
  artifacts?: {
    id: string;
    name: string;
    type: 'code' | 'test' | 'report' | 'diagram';
    content?: string;
    size?: number;
    path?: string;
  }[];
  subTasks?: InteractiveTask[];
  metrics?: {
    startTime: number;
    elapsedMs: number;
    tokensUsed: number;
    toolCalls: number;
  };
}

@Injectable({ providedIn: 'root' })
export class InteractiveTaskController {
  private activeTasks = new Map<string, InteractiveTask>();
  private taskSubject = new BehaviorSubject<InteractiveTask | null>(null);
  
  readonly activeTask$ = this.taskSubject.asObservable();
  
  async startTask(config: {
    id: string;
    title: string;
    initialPhase: TaskPhase;
  }): Promise<InteractiveTask> {
    const task: InteractiveTask = {
      id: config.id,
      title: config.title,
      description: '',
      phase: config.initialPhase,
      metrics: {
        startTime: Date.now(),
        elapsedMs: 0,
        tokensUsed: 0,
        toolCalls: 0,
      }
    };
    
    // KOSONGKAN TIMELINE SOSIAL MEDIA SEBELUM TASK DIMULAI
    agentEventBus.next({ 
      id: `task-${generateId()}`, 
      type: 'session.init', 
      timestamp: new Date().toISOString() 
    });
    
    this.activeTasks.set(config.id, task);
    this.taskSubject.next(task);
    return task;
  }
  
  async updatePhase(
    taskId: string,
    phase: TaskPhase,
    updates?: Partial<InteractiveTask>
  ): Promise<void> {
    const task = this.activeTasks.get(taskId);
    if (!task) return;
    
    task.phase = phase;
    task.actions = this.generateActionsForPhase(phase, task);
    
    Object.assign(task, updates);
    
    if (task.metrics) {
      task.metrics.elapsedMs = Date.now() - task.metrics.startTime;
    }
    
    this.taskSubject.next({ ...task });
  }
  
  async handleAction(taskId: string, actionId: string): Promise<void> {
    const task = this.activeTasks.get(taskId);
    if (!task) return;
    
    switch (actionId) {
      case 'continue':
        await this.updatePhase(taskId, 'executing');
        break;
      case 'revise':
        await this.updatePhase(taskId, 'planning', {
          description: 'Menunggu revisi instruksi...'
        });
        break;
      case 'cancel':
        await this.cancelTask(taskId);
        break;
      case 'run_tests':
        await this.updatePhase(taskId, 'validating', {
          progress: { current: 0, total: task.artifacts?.length || 0, label: 'Menjalankan test suite...' }
        });
        break;
      case 'download_all':
        await this.downloadArtifacts(taskId);
        break;
    }
  }
  
  private generateActionsForPhase(phase: TaskPhase, task: InteractiveTask) {
    switch (phase) {
      case 'planning':
        return [
          { id: 'continue', label: '✓ Lanjutkan', style: 'primary' as const },
          { id: 'revise', label: '✎ Revisi', style: 'secondary' as const },
          { id: 'cancel', label: '✗ Batal', style: 'danger' as const },
        ];
      case 'presenting':
        return [
          { id: 'run_tests', label: '🧪 Jalankan Test', style: 'primary' as const },
          { id: 'download_all', label: '📥 Download', style: 'secondary' as const },
          { id: 'regenerate', label: '🔄 Regenerate', style: 'secondary' as const },
        ];
      case 'completed':
        return [
          { id: 'new_task', label: '➕ Task Baru', style: 'primary' as const },
          { id: 'download_all', label: '📥 Download', style: 'secondary' as const },
        ];
      default:
        return [
          { id: 'cancel', label: '⏹ Batal', style: 'danger' as const },
        ];
    }
  }
  
  private async cancelTask(taskId: string): Promise<void> {
    // Assuming toolPipeline has cancel method implementation or we just clean up
    // toolPipeline.cancel(taskId);
    this.activeTasks.delete(taskId);
    this.taskSubject.next(null);
  }
  
  private async downloadArtifacts(taskId: string): Promise<void> {
    const task = this.activeTasks.get(taskId);
    if (!task?.artifacts) return;
    
    for (const artifact of task.artifacts) {
      if (artifact.path) {
        // Implement download logic
      }
    }
  }
}
