import { Component, Input, computed, signal, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';

// --- Interfaces ---
export type ThinkStatus = 'pending' | 'running' | 'done' | 'error' | 'skipped';

export interface AgentProfile {
  id: string;
  name: string;
  role?: string;
  themeColor?: string;
}

export interface ToolCall {
  id: string;
  tool: string;
  params: Record<string, unknown>;
  result?: string;
  latencyMs?: number;
  status: ThinkStatus;
  expanded?: boolean;
}

export interface ThinkStep {
  id: string;
  order: number;
  agentId: string;
  label: string;
  description?: string;
  status: ThinkStatus;
  toolCalls?: ToolCall[];
  tokensIn?: number;
  tokensOut?: number;
  subSteps?: ThinkStep[];
}

export interface ThinkSession {
  sessionId: string;
  startTime: number;
  endTime?: number;
  totalTokens?: number;
  agents: AgentProfile[];
  steps: ThinkStep[];
  isComplete: boolean;
}

interface SwimlaneData {
  agent: AgentProfile;
  steps: ThinkStep[];
  isActive: boolean;
}

@Component({
  selector: 'app-agent-think-stream',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="stream-container" [class.collapsed]="collapsed()">
      
      <header 
        class="global-header" 
        role="button" 
        tabindex="0" 
        [attr.aria-expanded]="!collapsed() ? 'true' : 'false'"
        (click)="toggleCollapse()"
        (keydown.enter)="toggleCollapse()"
        (keydown.space)="toggleCollapse()">
        
        <div class="header-left">
          <div class="status-indicator" [class.active]="!sessionData()?.isComplete"></div>
          <div class="session-meta">
            <h3 class="session-title">
              {{ sessionData()?.isComplete ? 'Sesi Selesai' : 'Sistem Multi-Agen Beroperasi' }}
            </h3>
            <div class="session-stats">
              @if (sessionData()?.totalTokens) {
                <span>{{ sessionData()?.totalTokens | number }} token</span>
              }
              @if (totalDurationMs() !== undefined) {
                <span class="dot-separator">·</span>
                <span>{{ totalDurationMs() }}ms</span>
              }
              @if (activeAgentsCount() > 0) {
                <span class="dot-separator">·</span>
                <span>{{ activeAgentsCount() }} agen aktif</span>
              }
            </div>
          </div>
        </div>

        <svg class="chevron" [class.rotated]="!collapsed()" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="6 9 12 15 18 9"></polyline>
        </svg>
      </header>

      @if (!collapsed() && swimlanes().length > 0) {
        <div class="swimlanes-wrapper">
          @for (lane of swimlanes(); track lane.agent.id) {
            <div class="swimlane">
              
              <div class="swimlane-header">
                <div class="agent-avatar" [style.backgroundColor]="lane.agent.themeColor || '#94a3b8'">
                  {{ getInitials(lane.agent.name) }}
                </div>
                <div class="agent-info">
                  <div class="agent-name">{{ lane.agent.name }}</div>
                  @if (lane.agent.role) {
                    <div class="agent-role">{{ lane.agent.role }}</div>
                  }
                </div>
                @if (lane.isActive) {
                  <div class="pulse-mini"></div>
                }
              </div>

              <div class="swimlane-steps">
                @for (step of lane.steps; track step.id) {
                  <div class="step-card" [attr.data-status]="step.status">
                    
                    <div class="step-header">
                      <div class="step-title-row">
                        <span class="status-dot" [attr.data-status]="step.status"></span>
                        <span class="step-label">{{ step.label }}</span>
                      </div>
                      
                      <div class="step-badges">
                        @if (step.tokensIn) {
                          <span class="badge token">{{ step.tokensIn }}→{{ step.tokensOut || 0 }}</span>
                        }
                      </div>
                    </div>

                    @if (step.description) {
                      <div class="step-desc">{{ step.description }}</div>
                    }

                    @if (step.toolCalls && step.toolCalls.length > 0) {
                      <div class="tools-container">
                        @for (tool of step.toolCalls; track tool.id) {
                          <div class="tool-card" 
                               role="button" 
                               tabindex="0"
                               (click)="toggleTool(tool.id)"
                               (keydown.enter)="toggleTool(tool.id)"
                               (keydown.space)="toggleTool(tool.id)">
                            
                            <div class="tool-header">
                              <span class="tool-name">
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"></path></svg>
                                {{ tool.tool }}
                              </span>
                              @if (tool.latencyMs) {
                                <span class="tool-latency">{{ tool.latencyMs }}ms</span>
                              }
                            </div>
                            
                            @if (expandedTools().has(tool.id)) {
                              <div class="tool-body">
                                <div class="code-block">
                                  <div class="code-label">Params</div>
                                  <code>{{ tool.params | json }}</code>
                                </div>
                                @if (tool.result !== undefined) {
                                  <div class="code-block mt-2">
                                    <div class="code-label">Result</div>
                                    <code>{{ tool.result }}</code>
                                  </div>
                                }
                              </div>
                            }
                          </div>
                        }
                      </div>
                    }
                  </div>
                }
                
                @if (lane.steps.length === 0) {
                  <div class="empty-lane">Menunggu instruksi...</div>
                }
              </div>
            </div>
          }
        </div>
      }
    </div>
  `,
  styles: [`
    :host { display: block; font-family: ui-sans-serif, system-ui, -apple-system, sans-serif; }
    .stream-container { background: #ffffff; border-radius: 20px; border: 1px solid #f1f5f9; box-shadow: 0 4px 20px rgba(0, 0, 0, 0.03); overflow: hidden; transition: all 0.3s ease; }
    .global-header { display: flex; align-items: center; justify-content: space-between; padding: 16px 24px; cursor: pointer; user-select: none; background: #ffffff; outline: none; }
    .global-header:hover, .global-header:focus-visible { background: #f8fafc; }
    .header-left { display: flex; align-items: center; gap: 16px; }
    .status-indicator { width: 10px; height: 10px; border-radius: 50%; background: #cbd5e1; transition: background 0.3s; }
    .status-indicator.active { background: #10b981; box-shadow: 0 0 0 3px rgba(16, 185, 129, 0.2); animation: pulse 2s infinite; }
    @keyframes pulse { 0% { box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.4); } 70% { box-shadow: 0 0 0 6px rgba(16, 185, 129, 0); } 100% { box-shadow: 0 0 0 0 rgba(16, 185, 129, 0); } }
    .session-meta { display: flex; flex-direction: column; gap: 2px; }
    .session-title { margin: 0; font-size: 15px; font-weight: 600; color: #0f172a; }
    .session-stats { font-size: 13px; color: #64748b; display: flex; align-items: center; }
    .dot-separator { margin: 0 6px; color: #cbd5e1; }
    .chevron { color: #94a3b8; transition: transform 0.3s ease; }
    .chevron.rotated { transform: rotate(180deg); }
    .swimlanes-wrapper { display: flex; gap: 16px; padding: 0 24px 24px 24px; overflow-x: auto; align-items: flex-start; scrollbar-width: thin; scrollbar-color: #cbd5e1 transparent; }
    .swimlanes-wrapper::-webkit-scrollbar { height: 6px; }
    .swimlanes-wrapper::-webkit-scrollbar-thumb { background-color: #cbd5e1; border-radius: 10px; }
    .swimlane { flex: 0 0 320px; min-width: 300px; max-width: 400px; background: #f8fafc; border-radius: 16px; border: 1px solid #f1f5f9; display: flex; flex-direction: column; }
    .swimlane-header { display: flex; align-items: center; gap: 12px; padding: 16px; border-bottom: 1px solid #f1f5f9; }
    .agent-avatar { width: 32px; height: 32px; border-radius: 10px; color: white; display: flex; align-items: center; justify-content: center; font-weight: 600; font-size: 12px; letter-spacing: 0.5px; flex-shrink: 0; }
    .agent-info { flex: 1; min-width: 0; }
    .agent-name { font-size: 13.5px; font-weight: 600; color: #1e293b; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .agent-role { font-size: 11px; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; margin-top: 2px; }
    .pulse-mini { width: 6px; height: 6px; background: #3b82f6; border-radius: 50%; animation: pulse-blue 1.5s infinite; }
    @keyframes pulse-blue { 0% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(59, 130, 246, 0.7); } 70% { transform: scale(1); box-shadow: 0 0 0 4px rgba(59, 130, 246, 0); } 100% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(59, 130, 246, 0); } }
    .swimlane-steps { padding: 12px; display: flex; flex-direction: column; gap: 10px; }
    .step-card { background: #ffffff; border-radius: 12px; padding: 14px; box-shadow: 0 1px 3px rgba(0,0,0,0.02); border: 1px solid #e2e8f0; transition: border-color 0.2s; }
    .step-card[data-status="running"] { border-color: #bfdbfe; }
    .step-card[data-status="error"] { border-color: #fecaca; }
    .step-header { display: flex; justify-content: space-between; align-items: flex-start; gap: 8px; margin-bottom: 6px; }
    .step-title-row { display: flex; align-items: center; gap: 8px; }
    .status-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
    .status-dot[data-status="pending"] { background: #cbd5e1; }
    .status-dot[data-status="running"] { background: #3b82f6; }
    .status-dot[data-status="done"] { background: #10b981; }
    .status-dot[data-status="error"] { background: #ef4444; }
    .status-dot[data-status="skipped"] { background: #94a3b8; opacity: 0.5; }
    .step-label { font-size: 13px; font-weight: 600; color: #334155; line-height: 1.3; }
    .badge { font-family: 'JetBrains Mono', monospace; font-size: 10px; font-weight: 600; padding: 3px 6px; border-radius: 6px; background: #f1f5f9; color: #64748b; }
    .step-desc { font-size: 12px; color: #64748b; line-height: 1.5; margin-bottom: 10px; }
    .tools-container { display: flex; flex-direction: column; gap: 8px; margin-top: 10px; }
    .tool-card { border: 1px solid #f1f5f9; border-radius: 10px; background: #fafafa; cursor: pointer; outline: none; transition: background 0.2s; }
    .tool-card:hover, .tool-card:focus-visible { background: #f1f5f9; }
    .tool-header { padding: 10px 12px; display: flex; justify-content: space-between; align-items: center; }
    .tool-name { font-family: 'JetBrains Mono', monospace; font-size: 11.5px; font-weight: 600; color: #475569; display: flex; align-items: center; gap: 6px; }
    .tool-latency { font-size: 10px; color: #94a3b8; }
    .tool-body { padding: 0 12px 12px 12px; }
    .code-block { background: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; }
    .code-label { font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: #94a3b8; padding: 6px 10px; background: #f8fafc; border-bottom: 1px solid #e2e8f0; }
    .code-block code { display: block; padding: 8px 10px; font-family: 'JetBrains Mono', monospace; font-size: 11px; color: #334155; white-space: pre-wrap; word-break: break-word; line-height: 1.4; }
    .mt-2 { margin-top: 8px; }
    .empty-lane { text-align: center; padding: 20px; font-size: 12px; color: #94a3b8; font-style: italic; }
  `]
})
export class AgentThinkStreamComponent {
  
  // Input Binding State menggunakan Signal
  protected sessionData = signal<ThinkSession | undefined>(undefined);

  @Input() 
  set session(value: ThinkSession | undefined) {
    this.sessionData.set(value);
  }

  // UI State terpisah dari Domain State
  collapsed = signal<boolean>(false);
  expandedTools = signal<Set<string>>(new Set<string>());

  // --- Computed Performance Data (Angular Signals) ---
  
  swimlanes = computed<SwimlaneData[]>(() => {
    const data = this.sessionData();
    // Proteksi Null/Undefined yang sangat ketat
    if (!data || !data.agents || !data.steps) return [];

    return data.agents.map(agent => {
      // Sembunyikan think-step yang tidak memiliki konten sama sekali (skipped)
      const stepsForAgent = data.steps.filter(s => s.agentId === agent.id && s.status !== 'skipped');
      
      // Menggunakan fallback array (?? []) jika toolCalls kosong untuk mencegah TS Strict Error
      const isActive = !data.isComplete && stepsForAgent.some(s => 
        s.status === 'running' || 
        (s.toolCalls ?? []).some(t => t.status === 'running')
      );

      return {
        agent,
        steps: stepsForAgent,
        isActive
      };
    }).filter(lane => lane.steps.length > 0 || lane.isActive);
  });

  totalDurationMs = computed<number | undefined>(() => {
    const data = this.sessionData();
    if (!data || !data.startTime) return undefined;
    if (data.endTime) {
      return data.endTime - data.startTime;
    }
    return undefined;
  });

  activeAgentsCount = computed<number>(() => {
    return this.swimlanes().filter(lane => lane.isActive).length;
  });

  // --- Methods ---

  toggleCollapse(): void {
    this.collapsed.update(v => !v);
  }

  toggleTool(toolId: string): void {
    this.expandedTools.update(currentSet => {
      const newSet = new Set(currentSet);
      if (newSet.has(toolId)) {
        newSet.delete(toolId);
      } else {
        newSet.add(toolId);
      }
      return newSet;
    });
  }

  getInitials(name: string): string {
    if (!name) return 'A';
    // Menggunakan regex \\s+ mencegah bug jika ada spasi ganda berturut-turut pada nama
    return name
      .trim()
      .split(/\\s+/)
      .map(n => n[0])
      .slice(0, 2)
      .join('')
      .toUpperCase();
  }
}
