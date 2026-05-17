import {
  Injectable,
  signal,
  computed,
  Component,
  Input,
  ChangeDetectionStrategy,
  inject,
  OnDestroy,
  NgZone
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subscription } from 'rxjs';
import { agentEventBus } from './agent/agent-event-bus';
import { ThinkSession, ThinkStep } from './agent-think-stream';

export type StreamEventType =
  | 'think.start' | 'think.chunk' | 'think.end'
  | 'code.start' | 'code.output' | 'code.end'
  | 'tool.start' | 'tool.result' | 'tool.error'
  | 'text.chunk'
  | 'status.change'
  | 'session.init' | 'session.complete';

export interface StreamEvent {
  id: string;
  type: StreamEventType;
  timestamp: string;
  parentId?: string;
  payload?: {
    label?: string;
    description?: string;
    content?: string;
    plan?: string;
    thought?: string;
    reasoning?: string;
    confidence?: number;
    evidence?: string[];
    language?: string;
    code?: string;
    output?: string;
    exitCode?: number;
    toolName?: string;
    params?: Record<string, unknown>;
    result?: unknown;
    error?: string;
    mimeType?: string;
    src?: string;
    alt?: string;
    elapsedMs?: number;
    tokensIn?: number;
    tokensOut?: number;
  };
  metadata?: {
    agentName?: string;
    agentId?: string;
    themeColor?: string;
    order?: number;
    status?: 'pending' | 'running' | 'success' | 'error' | 'warning' | 'skipped';
  };
}

interface InternalNode {
  id: string;
  type: 'think' | 'code' | 'tool' | 'text' | 'media' | 'log' | 'group';
  label: string;
  agentId?: string;
  status: 'pending' | 'running' | 'success' | 'error' | 'warning' | 'skipped';
  content?: string;
  plan?: string;
  thought?: string;
  reasoning?: string;
  confidence?: number;
  evidence?: string[];
  codeMeta?: { language?: string; code?: string; output?: string; exitCode?: number };
  toolMeta?: { toolName?: string; params?: Record<string, unknown>; result?: unknown; error?: string };
  mediaMeta?: { src?: string; mimeType?: string; alt?: string };
  elapsedMs?: number;
  tokensIn?: number;
  tokensOut?: number;
  order: number;
  parentId?: string;
  children: string[];
  startedAt: string;
  endedAt?: string;
}

interface SessionState {
  agentId: string;
  agentName: string;
  agents: { id: string; name: string; themeColor: string }[];
  status: 'idle' | 'active' | 'done' | 'error';
  startedAt: string;
  endedAt?: string;
  events: StreamEvent[];
  nodes: Map<string, InternalNode>;
  rootIds: string[];
  totalTokensIn: number;
  totalTokensOut: number;
  updateTick: number; // For change detection without deep cloning
}

type NodeStatus = 'pending' | 'running' | 'success' | 'error' | 'warning' | 'skipped' | 'cancelled';
type NodeType = 'think' | 'code' | 'tool' | 'visual' | 'media' | 'text' | 'log' | 'group';

interface ExecutionNode {
  id: string;
  type: NodeType;
  label: string;
  description?: string;
  status: NodeStatus;
  content?: string;
  meta?: Record<string, unknown>;
  children?: ExecutionNode[];
  order?: number;
  startedAt?: string;
  endedAt?: string;
  elapsedMs?: number;
  progress?: number;
  badges?: string[];
}

interface WorkspaceSession {
  agentId: string;
  agentName: string;
  status: 'idle' | 'active' | 'done' | 'error';
  startedAt: string;
  endedAt?: string;
  nodes: ExecutionNode[];
  tokensIn?: number;
  tokensOut?: number;
  tokensLimit?: number;
}

@Injectable({ providedIn: 'root' })
export class AgentStreamOrchestrator implements OnDestroy {
  private readonly _state = signal<SessionState | undefined>(undefined);
  private sub?: Subscription;
  private ngZone = inject(NgZone);

  constructor() {
    this.sub = agentEventBus.subscribe(evt => {
      this.ngZone.run(() => {
        this.ingestEvent(evt);
      });
    });
  }

  readonly state = this._state.asReadonly();
  readonly isActive = computed(() => this._state()?.status === 'active');
  readonly isComplete = computed(() => this._state()?.status === 'done');
  readonly eventCount = computed(() => this._state()?.events.length ?? 0);
  readonly nodeCount = computed(() => this._state()?.nodes.size ?? 0);

  readonly allThinkNodes = computed(() => {
    const s = this._state();
    if (!s) return [] as InternalNode[];
    const thinks: InternalNode[] = [];
    for (const node of s.nodes.values()) {
      if (node.type === 'think') thinks.push(node);
    }
    return thinks.sort((a, b) => a.order - b.order);
  });

  readonly hasActiveThinking = computed(() =>
    this.allThinkNodes().some(n => n.status === 'running')
  );

  readonly isAllThinkingDone = computed(() => {
    const thinks = this.allThinkNodes();
    if (thinks.length === 0) return true;
    return thinks.every(n => ['success', 'error', 'skipped'].includes(n.status));
  });

  readonly thinkSession = computed<ThinkSession | undefined>(() => {
    const s = this._state();
    if (!s) return undefined;
    return this.buildThinkSession(s);
  });

  readonly workspaceSession = computed<WorkspaceSession | undefined>(() => {
    const s = this._state();
    if (!s) return undefined;
    return this.buildWorkspaceSession(s);
  });

  initSession(agentId: string, agentName: string) {
    this._state.set({
      agentId,
      agentName,
      status: 'active',
      startedAt: new Date().toISOString(),
      events: [],
      agents: [],
      nodes: new Map(),
      rootIds: [],
      totalTokensIn: 0,
      totalTokensOut: 0,
      updateTick: 0
    });
  }

  ingestEvent(evt: StreamEvent) {
    this._state.update(s => {
      if (evt.type === 'session.init') {
        s = {
          agentId: evt.metadata?.agentId || 'default-agent',
          agentName: evt.metadata?.agentName || 'Lumina ✨',
          status: 'active',
          startedAt: evt.timestamp,
          events: [],
          agents: [],
          nodes: new Map(),
          rootIds: [],
          totalTokensIn: 0,
          totalTokensOut: 0,
          updateTick: 0
        };
      }
      if (!s) return s;

      s.events.push(evt);
      this.applyEvent(s, evt);
      return { ...s, updateTick: s.updateTick + 1 };
    });
  }

  ingestBatch(events: StreamEvent[]) {
    this._state.update(s => {
      for (const evt of events) {
        if (evt.type === 'session.init') {
          s = {
            agentId: evt.metadata?.agentId || 'default-agent',
            agentName: evt.metadata?.agentName || 'Lumina ✨',
            status: 'active',
            startedAt: evt.timestamp,
            events: [],
            agents: [],
            nodes: new Map(),
            rootIds: [],
            totalTokensIn: 0,
            totalTokensOut: 0,
            updateTick: 0
          };
        }
        if (!s) continue;
        s.events.push(evt);
        this.applyEvent(s, evt);
      }
      return s ? { ...s, updateTick: s.updateTick + 1 } : s;
    });
  }

  completeSession() {
    this._state.update(s => {
      if (!s) return s;
      s.status = 'done';
      s.endedAt = new Date().toISOString();
      for (const node of s.nodes.values()) {
        if (node.status === 'running') {
          node.status = 'success';
          node.endedAt = s.endedAt;
        }
      }
      return { ...s, updateTick: s.updateTick + 1 };
    });
  }

  reset() {
    this._state.set(undefined);
  }

  truncateSteps(keep: number) {
    this._state.update(s => {
      if (!s) return s;
      // Truncate nodes logic to keep only the most recent 'keep' events / top-level nodes
      const allEvents = [...s.events];
      const truncEvents = allEvents.length > keep ? allEvents.slice(allEvents.length - keep) : allEvents;
      
      return { 
        ...s, 
        events: truncEvents,
        updateTick: s.updateTick + 1 
      };
    });
  }

  ngOnDestroy() {
    this.sub?.unsubscribe();
    this.reset();
  }

  private applyEvent(s: SessionState, evt: StreamEvent) {
    const p = evt.payload ?? {};
    const m = evt.metadata ?? {};

    if (m.agentId && !s.agents.find(a => a.id === m.agentId)) {
      let agentName = m.agentName || m.agentId;
      let themeColor = m.themeColor || '#94a3b8';

      if (!m.agentName && !m.themeColor) {
        if (m.agentId === 'main-agent') {
           agentName = 'Lumina (Orchestrator)';
           themeColor = '#4f46e5';
        } else if (m.agentId.includes('gemma')) {
           agentName = 'Gemma (Reasoning)';
           themeColor = '#059669';
        } else if (m.agentId.includes('flash')) {
           agentName = 'Flash (Fast Worker)';
           themeColor = '#ea580c';
        } else {
           themeColor = '#4f46e5';
        }
      }

      s.agents.push({
        id: m.agentId,
        name: agentName,
        themeColor: themeColor
      });
    }

    switch (evt.type) {
      case 'session.init':
        if (m.agentName) s.agentName = m.agentName;
        if (m.agentId) s.agentId = m.agentId;
        break;
      case 'session.complete':
        s.status = 'done';
        s.endedAt = evt.timestamp;
        break;
      case 'status.change':
        if (m.status && ['idle','active','done','error'].includes(m.status)) {
          s.status = m.status as SessionState['status'];
        }
        break;
      case 'think.start':
        this.upsertNode(s, evt.id, {
          type: 'think', label: p.label ?? 'Thinking', status: 'running', agentId: m.agentId,
          plan: p.plan, thought: p.thought, reasoning: p.reasoning,
          confidence: p.confidence, evidence: p.evidence,
          order: m.order ?? s.nodes.size, parentId: evt.parentId
        });
        break;
      case 'think.chunk':
        this.patchNode(s, evt.id, n => {
          if (p.thought) n.thought = (n.thought ?? '') + p.thought;
          if (p.reasoning) n.reasoning = (n.reasoning ?? '') + p.reasoning;
          if (p.content) n.content = (n.content ?? '') + p.content;
          if (p.description) n.reasoning = p.description; // Overwrite FULL chunk instead of append, since we pass the whole matched string
        });
        break;
      case 'think.end':
        this.patchNode(s, evt.id, n => {
          if (!n.reasoning && !n.thought && !n.content && n.children.length === 0) {
            n.status = 'skipped';
          } else {
            n.status = m.status === 'error' ? 'error' : 'success';
          }
          n.endedAt = evt.timestamp;
          if (p.elapsedMs) n.elapsedMs = p.elapsedMs;
          if (p.tokensIn) { n.tokensIn = p.tokensIn; s.totalTokensIn += p.tokensIn; }
          if (p.tokensOut) { n.tokensOut = p.tokensOut; s.totalTokensOut += p.tokensOut; }
        });
        break;
      case 'code.start':
        this.upsertNode(s, evt.id, {
          type: 'code', label: p.label ?? ('Code: ' + (p.language ?? 'unknown')), status: 'running',
          codeMeta: { language: p.language, code: p.code },
          order: m.order ?? s.nodes.size, parentId: evt.parentId
        });
        break;
      case 'code.output':
        this.patchNode(s, evt.id, n => {
          if (!n.codeMeta) n.codeMeta = {};
          n.codeMeta.output = (n.codeMeta.output ?? '') + (p.output ?? '');
        });
        break;
      case 'code.end':
        this.patchNode(s, evt.id, n => {
          n.status = p.exitCode !== 0 ? 'error' : 'success';
          n.endedAt = evt.timestamp;
          if (p.exitCode !== undefined && n.codeMeta) n.codeMeta.exitCode = p.exitCode;
          if (p.elapsedMs) n.elapsedMs = p.elapsedMs;
        });
        break;
      case 'tool.start':
        this.upsertNode(s, evt.id, {
          type: 'tool', label: p.label ?? ('Tool: ' + (p.toolName ?? 'unknown')), status: 'running',
          toolMeta: { toolName: p.toolName, params: p.params },
          order: m.order ?? s.nodes.size, parentId: evt.parentId
        });
        break;
      case 'tool.result':
        this.patchNode(s, evt.id, n => {
          if (!n.toolMeta) n.toolMeta = {};
          n.toolMeta.result = p.result;
          n.status = 'success';
          n.endedAt = evt.timestamp;
        });
        break;
      case 'tool.error':
        this.patchNode(s, evt.id, n => {
          if (!n.toolMeta) n.toolMeta = {};
          n.toolMeta.error = p.error ?? 'Unknown error';
          n.status = 'error';
          n.endedAt = evt.timestamp;
        });
        break;
      case 'text.chunk':
        this.upsertNode(s, evt.id, {
          type: 'text', label: p.label ?? 'Text', status: 'success', content: p.content,
          order: m.order ?? s.nodes.size, parentId: evt.parentId
        });
        break;
    }
  }

  private upsertNode(s: SessionState, id: string, partial: Partial<InternalNode> & Pick<InternalNode, 'type'|'label'|'status'|'order'>) {
    const existing = s.nodes.get(id);
    if (existing) {
      Object.assign(existing, partial);
      return;
    }
    const node: InternalNode = {
      id, children: [], startedAt: new Date().toISOString(), ...partial as any
    };
    s.nodes.set(id, node);
    if (node.parentId) {
      const parent = s.nodes.get(node.parentId);
      if (parent && !parent.children.includes(id)) {
        parent.children.push(id);
      }
    } else {
      if (!s.rootIds.includes(id)) s.rootIds.push(id);
    }
  }

  private patchNode(s: SessionState, id: string, fn: (n: InternalNode) => void) {
    const node = s.nodes.get(id);
    if (node) fn(node);
  }

  private buildThinkSession(s: SessionState): ThinkSession {
    const buildStep = (node: InternalNode): ThinkStep => {
      const statusMap: Record<string, ThinkStep['status']> = {
        pending: 'pending', running: 'running', success: 'done',
        error: 'error', warning: 'error', skipped: 'skipped'
      };
      
      const step: ThinkStep = {
        id: node.id, 
        order: node.order, 
        agentId: node.agentId || 'default-agent',
        label: node.label, 
        description: node.thought || node.reasoning || node.content,
        status: statusMap[node.status] ?? 'pending',
        tokensIn: node.tokensIn, 
        tokensOut: node.tokensOut, 
        toolCalls: [],
        subSteps: node.children.length > 0
          ? node.children.map(cid => s.nodes.get(cid)).filter((n): n is InternalNode => !!n).sort((a, b) => a.order - b.order).map(buildStep)
          : undefined
      };
      return step;
    };

    const allStepNodes = Array.from(s.nodes.values()).filter(n => 
      ['think', 'tool', 'code', 'text'].includes(n.type)
    );
    
    const topLevelNodes = allStepNodes.filter(n => {
      if (!n.parentId) return true;
      const parent = s.nodes.get(n.parentId);
      // Jika parent bukan salah satu tipe step, maka ini top level di context step
      return !parent || !['think', 'tool', 'code', 'text'].includes(parent.type);
    });

    const buildFullTree = (node: InternalNode): ThinkStep => {
      const step = buildStep(node);
      
      // Customize description for tools/code to make them look good in feed
      if (node.type === 'tool' && node.toolMeta) {
        step.description = `Memanggil tool \`${node.toolMeta.toolName}\` dengan parameter: ${JSON.stringify(node.toolMeta.params)}`;
        if (node.toolMeta.result) {
          step.description += `\n\n**Hasil:**\n${typeof node.toolMeta.result === 'string' ? node.toolMeta.result : JSON.stringify(node.toolMeta.result, null, 2)}`;
        }
        if (node.toolMeta.error) {
          step.description += `\n\n**Error:** ${node.toolMeta.error}`;
        }
      } else if (node.type === 'code' && node.codeMeta) {
        step.description = `Mengeksekusi kode ${node.codeMeta.language || ''}:\n\`\`\`${node.codeMeta.language || ''}\n${node.codeMeta.code}\n\`\`\``;
        if (node.codeMeta.output) {
          step.description += `\n\n**Output:**\n${node.codeMeta.output}`;
        }
      }

      const stepChildren = node.children
        .map(cid => s.nodes.get(cid))
        .filter((n): n is InternalNode => !!n && ['think', 'tool', 'code', 'text'].includes(n.type))
        .sort((a, b) => a.order - b.order);
        
      if (stepChildren.length > 0) step.subSteps = stepChildren.map(buildFullTree);
      return step;
    };

    const steps = topLevelNodes.sort((a, b) => a.order - b.order).map(buildFullTree);
    const hasRunningNodes = allStepNodes.some(n => n.status === 'running');

    return {
      sessionId: 'default-session',
      startTime: new Date(s.startedAt).getTime() || Date.now(),
      totalTokens: s.totalTokensIn + s.totalTokensOut,
      agents: s.agents.length > 0 ? s.agents : [
        { id: s.agentId || 'default-agent', name: s.agentName || 'Lumina ✨', role: 'AI Assistant', themeColor: '#3b82f6' }
      ],
      steps, 
      isComplete: s.status === 'done' && !hasRunningNodes
    };
  }

  private buildWorkspaceSession(s: SessionState): WorkspaceSession {
    const buildExec = (node: InternalNode): ExecutionNode => {
      const statusMap: Record<string, NodeStatus> = {
        pending: 'pending', running: 'running', success: 'success',
        error: 'error', warning: 'warning', skipped: 'skipped'
      };

      const exec: ExecutionNode = {
        id: node.id, type: node.type as NodeType, label: node.label, description: node.reasoning ?? node.content,
        status: statusMap[node.status] ?? 'pending', content: node.content, order: node.order,
        startedAt: node.startedAt, endedAt: node.endedAt, elapsedMs: node.elapsedMs,
        badges: this.buildBadges(node), meta: this.buildMeta(node),
        children: node.children.length > 0 ? node.children.map(cid => s.nodes.get(cid)).filter((n): n is InternalNode => !!n).sort((a, b) => a.order - b.order).map(buildExec) : undefined
      };
      return exec;
    };

    const roots = s.rootIds.map(id => s.nodes.get(id)).filter((n): n is InternalNode => !!n).sort((a, b) => a.order - b.order);

    return {
      agentId: s.agentId, agentName: s.agentName, status: s.status, startedAt: s.startedAt, endedAt: s.endedAt,
      nodes: roots.map(buildExec), tokensIn: s.totalTokensIn, tokensOut: s.totalTokensOut, tokensLimit: 128000
    };
  }

  private buildBadges(node: InternalNode): string[] {
    const badges: string[] = [];
    if (node.elapsedMs) badges.push(node.elapsedMs + 'ms');
    if (node.tokensIn || node.tokensOut) badges.push((node.tokensIn ?? 0) + '→' + (node.tokensOut ?? 0));
    if (node.confidence !== undefined) badges.push(Math.round(node.confidence * 100) + '% conf');
    return badges;
  }

  private buildMeta(node: InternalNode): Record<string, unknown> | undefined {
    const meta: Record<string, unknown> = {};
    if (node.plan) meta['plan'] = node.plan;
    if (node.thought) meta['thought'] = node.thought;
    if (node.reasoning) meta['reasoning'] = node.reasoning;
    if (node.confidence !== undefined) meta['confidence'] = node.confidence;
    if (node.evidence?.length) meta['evidence'] = node.evidence;
    if (node.codeMeta) {
      meta['language'] = node.codeMeta.language; meta['code'] = node.codeMeta.code;
      meta['output'] = node.codeMeta.output; meta['exitCode'] = node.codeMeta.exitCode;
    }
    if (node.toolMeta) {
      meta['toolName'] = node.toolMeta.toolName; meta['params'] = node.toolMeta.params;
      meta['result'] = node.toolMeta.result; meta['error'] = node.toolMeta.error;
    }
    if (node.mediaMeta) {
      meta['src'] = node.mediaMeta.src; meta['mimeType'] = node.mediaMeta.mimeType; meta['alt'] = node.mediaMeta.alt;
    }
    return Object.keys(meta).length > 0 ? meta : undefined;
  }
}

import { AgentThinkStreamComponent } from './agent-think-stream';

@Component({
  selector: 'app-agent-unified-shell',
  standalone: true,
  imports: [CommonModule, AgentThinkStreamComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="aus-shell" [attr.data-view]="activeView()">
      <!-- ═══ View Toggle ═══ -->
      <div class="aus-toolbar">
        <div class="aus-tabs">
          <button
            class="aus-tab"
            [class.active]="activeView() === 'think'"
            (click)="setView('think')"
            [disabled]="!thinkSession()">
            <span class="aus-tab-icon">💭</span>
            <span>Thinking</span>
            @if (thinkStepCount() > 0) {
              <span class="aus-tab-badge">{{ thinkStepCount() }}</span>
            }
            @if (orchestrator.hasActiveThinking()) {
              <span class="aus-tab-live"></span>
            }
          </button>
        </div>
        <div class="aus-actions">
          @if (orchestrator.isActive()) {
            <span class="aus-live-indicator">
              <span class="aus-live-dot"></span>
              Live
            </span>
          }
          <button class="aus-btn-icon" (click)="orchestrator.reset()" title="Reset session">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
          </button>
        </div>
      </div>

      <!-- ═══ Think View ═══ -->
      @if (activeView() === 'think' && thinkSession()) {
        <div class="aus-panel">
          <app-agent-think-stream [session]="thinkSession()!" />
        </div>
      }

      <!-- ═══ Empty State ═══ -->
      @if (!thinkSession()) {
        <div class="aus-empty">
          <span class="aus-empty-icon">◉</span>
          <p>Belum ada session aktif.</p>
          <p class="aus-empty-hint">Panggil orchestrator.initSession() untuk memulai.</p>
        </div>
      }
    </div>
  `,
  styles: [`
    :host { display: block; }
    .aus-shell { background: #0a0a0a; border: 1px solid #222; border-radius: 14px; overflow: hidden; color: #e5e5e5; font-family: ui-sans-serif, system-ui, sans-serif; font-size: 13.5px; min-height: 200px; }
    .aus-shell[data-view="split"] { display: flex; flex-direction: column; }
    .aus-toolbar { display: flex; align-items: center; justify-content: space-between; padding: 10px 14px; background: #111; border-bottom: 1px solid #222; gap: 12px; }
    .aus-tabs { display: flex; gap: 4px; flex: 1; }
    .aus-tab { display: flex; align-items: center; gap: 6px; padding: 6px 12px; border-radius: 8px; border: none; background: transparent; color: #525252; font-size: 13px; font-weight: 500; cursor: pointer; transition: all 0.2s; font-family: inherit; position: relative; }
    .aus-tab:hover:not(:disabled) { background: #1a1a1a; color: #a3a3a3; }
    .aus-tab.active { background: #1f1f1f; color: #e5e5e5; }
    .aus-tab:disabled { opacity: 0.3; cursor: not-allowed; }
    .aus-tab-icon { font-size: 14px; }
    .aus-tab-badge { font-size: 10px; font-weight: 700; background: #333; color: #a3a3a3; padding: 1px 5px; border-radius: 4px; font-family: ui-monospace, monospace; }
    .aus-tab.active .aus-tab-badge { background: #3b82f6; color: #fff; }
    .aus-tab-live { width: 6px; height: 6px; background: #22c55e; border-radius: 50%; animation: tab-live 2s infinite; }
    @keyframes tab-live { 0%,100%{opacity:1} 50%{opacity:.2} }
    .aus-actions { display: flex; align-items: center; gap: 10px; }
    .aus-live-indicator { display: flex; align-items: center; gap: 6px; font-size: 11px; font-weight: 600; color: #3b82f6; font-family: ui-monospace, monospace; }
    .aus-live-dot { width: 6px; height: 6px; background: #3b82f6; border-radius: 50%; animation: live-pulse 2s infinite; }
    @keyframes live-pulse { 0%,100%{opacity:1} 50%{opacity:.3} }
    .aus-btn-icon { background: none; border: none; color: #525252; cursor: pointer; padding: 4px; border-radius: 6px; display: flex; align-items: center; transition: all 0.2s; }
    .aus-btn-icon:hover { background: #1a1a1a; color: #e5e5e5; }
    .aus-panel { padding: 16px; max-height: 70vh; overflow-y: auto; }
    .aus-panel::-webkit-scrollbar { width: 5px; }
    .aus-panel::-webkit-scrollbar-thumb { background: #333; border-radius: 3px; }
    .aus-split { display: flex; flex: 1; min-height: 300px; }
    .aus-split-left { flex: 1; min-width: 0; padding: 16px; overflow-y: auto; }
    .aus-split-right { flex: 1; min-width: 0; padding: 16px; overflow-y: auto; }
    .aus-split-divider { width: 1px; background: #222; }
    .aus-empty { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; padding: 60px 20px; color: #525252; font-size: 13px; text-align: center; }
    .aus-empty-icon { font-size: 28px; opacity: 0.3; }
    .aus-empty-hint { font-size: 12px; color: #333; }
  `]
})
export class AgentUnifiedShellComponent implements OnDestroy {
  public orchestrator = inject(AgentStreamOrchestrator);

  activeView = signal<'think' | 'workspace' | 'split'>('workspace');

  thinkSession = this.orchestrator.thinkSession;
  workspaceSession = this.orchestrator.workspaceSession;

  thinkStepCount = computed(() => this.thinkSession()?.steps?.length ?? 0);
  workspaceNodeCount = computed(() => this.workspaceSession()?.nodes?.length ?? 0);

  hasRunningWork = computed(() => {
    const ws = this.workspaceSession();
    if (!ws) return false;
    const check = (nodes: ExecutionNode[]): boolean =>
      nodes.some(n => {
        if (n.status === 'running' && n.type !== 'think') return true;
        if (n.children) return check(n.children);
        return false;
      });
    return check(ws.nodes);
  });

  setView(view: 'think' | 'workspace' | 'split') {
    this.activeView.set(view);
  }

  ngOnDestroy() {
    this.orchestrator.reset();
  }
}

export type {
  ThinkSession,
  ThinkStep,
  WorkspaceSession,
  ExecutionNode
};
