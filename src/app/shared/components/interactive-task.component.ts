import { Component, computed, inject, input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { toSignal } from '@angular/core/rxjs-interop';
import { ASCIIDiagram } from '../../tools/ascii-diagram';
import { InteractiveTask, InteractiveTaskController, TaskPhase } from '../../core/services/interactive-task.service';
import { AgentSocialFeedComponent } from '../../components/agent-social-feed.component';
import { AgentStreamOrchestrator } from '../../agent-stream-orchestrator';

@Component({
  selector: 'app-interactive-task',
  standalone: true,
  imports: [CommonModule, AgentSocialFeedComponent],
  template: `
    @if (task()) {
      <div class="bg-white border border-slate-200 shadow-sm rounded-xl p-5 my-4 font-sans transition-all duration-300" [attr.data-phase]="task()!.phase">
        
        <!-- Header: Title + Phase Indicator -->
        <div class="flex items-center gap-3 mb-4">
          <div class="text-xl w-10 h-10 flex items-center justify-center rounded-xl bg-slate-100 text-slate-700 shadow-inner" [class.pulsing]="isActive()">
            @switch (task()!.phase) {
              @case ('analyzing') { 🔍 }
              @case ('planning') { 📋 }
              @case ('awaiting_input') { ⏸️ }
              @case ('executing') { ⚙️ }
              @case ('validating') { 🧪 }
              @case ('presenting') { 📊 }
              @case ('completed') { ✅ }
            }
          </div>
          <div class="flex-1">
            <h4 class="text-sm font-semibold text-slate-800 leading-tight">{{ task()!.title }}</h4>
            <span class="text-[13px] text-slate-500 font-medium">{{ phaseLabel() }}</span>
          </div>
          @if (elapsedTime() > 0) {
            <span class="text-xs font-mono bg-slate-50 text-slate-500 py-1 px-2 rounded-md border border-slate-100">{{ formatElapsed(elapsedTime()) }}</span>
          }
        </div>

        <!-- Progress Section -->
        @if (task()!.progress; as progress) {
          <div class="my-4 space-y-2">
            <div class="h-2.5 bg-slate-100 rounded-full overflow-hidden border border-slate-200/50">
              <div class="h-full bg-indigo-500 rounded-full transition-all duration-500 ease-out" [style.width.%]="(progress.current / progress.total * 100)"></div>
            </div>
            <div class="flex justify-between items-center text-xs">
              <span class="font-medium text-slate-600">{{ progress.label }}</span>
              <span class="font-mono text-indigo-600 truncate max-w-[60%]">{{ progress.detail }}</span>
            </div>
          </div>
        }

        <!-- Content: ASCII Diagram atau Artifacts -->
        <div class="mt-4 pt-4 border-t border-slate-100">
          <app-agent-social-feed [session]="liveThinkSession()"></app-agent-social-feed>
        </div>
        <div class="mt-4 space-y-3">
          @if (task()!.artifacts; as artifacts) {
            <div class="grid gap-2 sm:grid-cols-2">
              @for (artifact of artifacts; track artifact.id) {
                <div class="flex items-center gap-2.5 p-2.5 bg-slate-50 border border-slate-200/60 rounded-lg group" [attr.data-type]="artifact.type">
                  <span class="text-base shrink-0 opacity-80">
                    @switch (artifact.type) {
                      @case ('code') { 📄 }
                      @case ('test') { 🧪 }
                      @case ('report') { 📊 }
                      @case ('diagram') { 🗺️ }
                    }
                  </span>
                  <span class="text-sm font-medium text-slate-700 truncate w-full">{{ artifact.name }}</span>
                  @if (artifact.size) {
                    <span class="text-xs text-slate-400 font-mono">{{ formatBytes(artifact.size) }}</span>
                  }
                  @if (artifact.content) {
                    <button class="shrink-0 text-[11px] font-semibold text-indigo-600 bg-white border border-indigo-100 px-2 py-1 rounded hover:bg-indigo-50 transition-colors" (click)="previewArtifact(artifact)">
                      Preview
                    </button>
                  }
                </div>
              }
            </div>
          }

          <!-- ASCII Visualization -->
          @if (visualOutput()) {
            <div class="mt-5 rounded-xl overflow-hidden bg-[#0d0d0d] border border-slate-800 shadow-2xl">
              <div class="flex items-center justify-between px-4 py-2 border-b border-slate-800 bg-[#141414]">
                <div class="flex items-center gap-2">
                  <div class="w-2.5 h-2.5 rounded-full bg-slate-700"></div>
                  <div class="w-2.5 h-2.5 rounded-full bg-slate-700"></div>
                  <div class="w-2.5 h-2.5 rounded-full bg-slate-700"></div>
                </div>
                <div class="flex items-center gap-3">
                  <button class="text-slate-400 hover:text-white transition-colors" title="Copy to clipboard" (click)="copyVisualOutput()">
                    <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                  </button>
                </div>
              </div>
              <div class="p-5 overflow-x-auto custom-scrollbar">
                <pre class="font-mono text-[13px] leading-relaxed text-slate-300 drop-shadow-sm">{{ visualOutput() }}</pre>
              </div>
            </div>
          }
        </div>

        <!-- Actions: User Interaction Points -->
        @if (task()!.actions; as actions) {
          <div class="flex flex-wrap gap-2 mt-5 pt-4 border-t border-slate-100">
            @for (action of actions; track action.id) {
              <button 
                class="px-4 py-2 rounded-lg text-sm font-semibold transition-all duration-200 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                [ngClass]="{
                  'bg-indigo-600 text-white hover:bg-indigo-700 hover:shadow': action.style === 'primary',
                  'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50 hover:text-slate-900': action.style === 'secondary',
                  'bg-rose-50 text-rose-600 border border-rose-100 hover:bg-rose-100': action.style === 'danger'
                }"
                [disabled]="action.disabled"
                (click)="onAction(action.id)">
                {{ action.label }}
              </button>
            }
          </div>
        }
      </div>
    }
  `,
  styles: [`
    :host { display: block; }
    
    .task-phase-indicator.pulsing {
      animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
    }
    
    @keyframes pulse {
      0%, 100% { opacity: 1; transform: scale(1); }
      50% { opacity: 0.6; transform: scale(0.95); }
    }
    
    .custom-scrollbar::-webkit-scrollbar {
      width: 6px;
      height: 6px;
    }
    
    .custom-scrollbar::-webkit-scrollbar-track {
      background: transparent;
    }
    
    .custom-scrollbar::-webkit-scrollbar-thumb {
      background: #334155;
      border-radius: 3px;
    }
    
    .custom-scrollbar::-webkit-scrollbar-thumb:hover {
      background: #475569;
    }
  `]
})
export class InteractiveTaskComponent {
  taskInput = input<InteractiveTask | null>(null);
  
  private taskController = inject(InteractiveTaskController);
  private activeTaskSignal = toSignal(this.taskController.activeTask$);
  
  private orchestrator = inject(AgentStreamOrchestrator);
  liveThinkSession = this.orchestrator.thinkSession;
  
  task = computed(() => {
    const inputTask = this.taskInput();
    if (inputTask) return inputTask;
    return this.activeTaskSignal() || undefined;
  });
  
  isActive = computed(() => ['analyzing', 'executing', 'validating'].includes(this.task()?.phase || ''));
  elapsedTime = computed(() => this.task()?.metrics?.elapsedMs || 0);
  
  visualOutput = computed(() => {
    if (!this.task()) return '';
    
    const diagram = new ASCIIDiagram({ borderStyle: 'round' });
    
    switch (this.task()!.phase) {
      case 'executing':
        return diagram.progressBar(
          'Progress',
          this.task()!.progress?.current || 0,
          this.task()!.progress?.total || 1
        );
      case 'presenting':
        return diagram.table(
          ['File', 'Tests', 'Status'],
          this.task()!.artifacts?.map(a => [a.name, '-', '✓']) || []
        );
      default:
        return '';
    }
  });
  
  phaseLabel = computed(() => {
    const labels: Record<TaskPhase, string> = {
      analyzing: 'Menganalisis...',
      planning: 'Merencanakan...',
      awaiting_input: 'Menunggu keputusan Anda',
      executing: 'Mengeksekusi...',
      validating: 'Memvalidasi...',
      presenting: 'Menampilkan hasil',
      completed: 'Selesai',
    };
    return labels[this.task()?.phase || 'analyzing'];
  });
  
  async onAction(actionId: string) {
    if (!this.task()) return;
    await this.taskController.handleAction(this.task()!.id, actionId);
  }
  
  formatElapsed(ms: number): string {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${(ms / 60000).toFixed(1)}m`;
  }
  
  formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes}B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
  }
  
  previewArtifact(artifact: any) {
    // Open preview
  }
  
  copyVisualOutput() {
    const val = this.visualOutput();
    if (val) {
      navigator.clipboard.writeText(val);
    }
  }
}
