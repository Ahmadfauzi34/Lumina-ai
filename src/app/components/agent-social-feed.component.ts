import { Component, Input, input, computed, ChangeDetectionStrategy, ViewEncapsulation } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ThinkSession, ThinkStep } from '../agent-think-stream';
import { MarkdownRendererComponent } from '../shared/components/markdown-renderer';

@Component({
  selector: 'app-agent-social-feed',
  standalone: true,
  imports: [CommonModule, MarkdownRendererComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  template: `
    <div class="feed-container flex flex-col gap-3">
      @for (step of feedPosts(); track step.id) {
        
        <div class="feed-block flex gap-3 p-3 rounded-2xl border transition-all duration-300 animate-in fade-in slide-in-from-bottom-2"
             [ngStyle]="{'background-color': getAgentColor(step.agentId) + '0D', 'border-color': getAgentColor(step.agentId) + '33'}">
          
          <div class="shrink-0 w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold text-white shadow-sm ring-2 ring-white"
               [style.backgroundColor]="getAgentColor(step.agentId)">
            {{ getInitials(step.agentId) }}
          </div>

          <div class="flex-1 min-w-0">
            
            <div class="flex items-center gap-2 mb-1.5">
              <span class="font-bold text-sm text-slate-800">
                {{ getAgentName(step.agentId) }}
              </span>
              
              @if (step.status === 'running') {
                <span class="flex items-center gap-1.5 text-[10px] font-semibold text-indigo-600 bg-indigo-50 px-2.5 py-0.5 rounded-full uppercase tracking-wider border border-indigo-100 shadow-sm">
                  <span class="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-pulse"></span>
                  Aktif
                </span>
              } @else if (step.status === 'error') {
                <span class="text-[10px] text-rose-500 font-bold bg-rose-50 px-2 py-0.5 rounded-full border border-rose-100">GAGAL</span>
              } @else {
                <span class="text-[10px] text-slate-400 font-medium">Selesai</span>
              }
            </div>

            <!-- Header khusus jika bukan sekedar "pikiran" (misal tool call) -->
            @if (step.label && step.label !== 'Thinking') {
               <div class="text-[11px] font-bold text-slate-500 mb-1 px-2 py-0.5 bg-slate-100/50 rounded inline-block">
                 {{ step.label }}
               </div>
            }

            <div class="text-[13.5px] leading-relaxed text-slate-700 relative">
               <app-markdown-renderer [text]="contentText(step)" />
               @if (step.status === 'running') {
                  <span class="inline-block w-1.5 h-3.5 ml-1 align-middle bg-indigo-400/50 animate-pulse rounded-sm"></span>
               }
            </div>

          </div>
        </div>
      }
      
      @if (feedPosts().length === 0) {
        <div class="text-center p-8 text-sm text-slate-400 border border-dashed border-slate-200 rounded-2xl bg-slate-50/50">
          <div class="text-2xl mb-2 opacity-50">📡</div>
          Menunggu aktivitas agen...
        </div>
      }
    </div>
  `,
  styles: [`
    :host { display: block; width: 100%; }
    
    /* Overriding Markdown styles for the feed context */
    .feed-block .markdown-body {
      font-size: 13.5px !important;
      line-height: 1.6 !important;
      color: inherit !important;
    }
    .feed-block .markdown-body p { margin-bottom: 0.5rem; }
    .feed-block .markdown-body p:last-child { margin-bottom: 0; }
    .feed-block .markdown-body pre { margin: 0.75rem 0 !important; }
    .feed-block .markdown-body code { font-size: 0.85em !important; }
    
    .mention-highlight {
      font-weight: 700;
      color: #3730a3;
      background-color: #e0e7ff;
      padding: 1px 5px;
      border-radius: 6px;
      border: 1px solid #c7d2fe;
    }
  `]
})
export class AgentSocialFeedComponent {
  session = input<ThinkSession | null | undefined>();

  feedPosts = computed(() => {
    const sess = this.session();
    if (!sess?.steps) return [];
    
    // Flatten steps AND subSteps since the social feed wants a flat array
    const flatSteps: ThinkStep[] = [];
    const extract = (steps: ThinkStep[]) => {
      for (const s of steps) {
        if (s.status !== 'skipped') {
          flatSteps.push(s);
        }
        if (s.subSteps && s.subSteps.length > 0) {
          extract(s.subSteps);
        }
      }
    };
    extract(sess.steps);
    
    return flatSteps.sort((a, b) => a.order - b.order);
  });

  getAgentName(agentId: string): string {
    const agent = this.session()?.agents.find((a) => a.id === agentId);
    return agent?.name || (agentId === 'main-agent' ? 'Lumina' : agentId);
  }

  getAgentColor(agentId: string): string {
    const agent = this.session()?.agents.find((a) => a.id === agentId);
    if (agent?.themeColor) return agent.themeColor;
    
    // Fallbacks
    if (agentId === 'main-agent') return '#4f46e5';
    if (agentId.includes('gemma')) return '#059669';
    if (agentId.includes('flash')) return '#ea580c';
    
    return '#64748b'; 
  }

  getInitials(agentId: string): string {
    const name = this.getAgentName(agentId);
    return name.substring(0, 2).toUpperCase();
  }

  contentText(step: ThinkStep): string {
    const desc = step.description || '';
    if (!desc) {
      if (step.label === 'Thinking') return '_Sedang berpikir..._';
      return '';
    }
    return this.processText(desc);
  }

  processText(text: string): string {
    if (!text) return '';
    // Mengubah @mention menjadi format Markdown yang nantinya kita styling via CSS
    // Kita gunakan format <span class="mention-highlight">@mention</span> jika renderer mendukung HTML 
    // atau gunakan Bold Markdown jika ingin lebih murni.
    // Karena MarkdownRenderer menggunakan [innerHTML] dan sanitizer, kita bisa coba gunakan bold dulu.
    return text.replace(/@([A-Za-z0-9_-]+)/g, '<span class="mention-highlight">@$1</span>');
  }
}
