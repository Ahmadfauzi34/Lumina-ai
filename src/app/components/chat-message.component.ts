import { Component, Input, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import type { Message } from '../types';
import { MarkdownRendererComponent } from '../shared/components/markdown-renderer';
import { ThinkSession } from '../agent-think-stream';
import { AgentSocialFeedComponent } from './agent-social-feed.component';

@Component({
  selector: 'app-chat-message',
  standalone: true,
  imports: [CommonModule, MarkdownRendererComponent, AgentSocialFeedComponent],
  template: `
    <div class="message" [ngClass]="isUser ? 'user' : 'ai'">
      <div class="msg-identity">
        <span class="msg-name" *ngIf="isUser">Anda</span>
        <div class="msg-avatar" [ngClass]="isUser ? 'user-av' : 'ai-av'">
          <svg *ngIf="isUser" class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
          <svg *ngIf="!isUser" class="w-3.5 h-3.5 text-white" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2L9.19 8.63L2 9.24L7.46 13.97L5.82 21L12 17.27L18.18 21L16.54 13.97L22 9.24L14.81 8.63L12 2Z"/></svg>
        </div>
        <span class="msg-name" *ngIf="!isUser">Lumina ✨</span>
      </div>

      <div class="msg-content" [ngClass]="isUser ? 'msg-bubble-user' : 'msg-bubble-ai'">
        
        @if (!isUser && hasVisibleThinkSteps) {
          <app-agent-social-feed 
            [session]="activeThinkSession" 
            class="block mb-4" 
          />
        }

        @if (cleanText) {
          <app-markdown-renderer [text]="cleanText" />
        }

        @if (message.isStreaming && !cleanText) {
          <div class="flex items-center gap-1.5 h-6 opacity-50 mt-2">
            <span class="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce"></span>
            <span class="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style="animation-delay: 150ms"></span>
            <span class="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style="animation-delay: 300ms"></span>
          </div>
        }
      </div>
    </div>
  `
})
export class ChatMessageComponent implements OnInit {
  @Input() message!: Message;
  
  // Sinyal langsung dari Orchestrator saat pesan sedang di-stream
  @Input() liveThinkSession?: ThinkSession | null; 
  @Input() liveText?: string; 

  isUser = false;
  
  // Menggabungkan data dari DB dengan data live stream
  get activeThinkSession(): ThinkSession | undefined {
    if (this.message.isStreaming && this.liveThinkSession) {
      return this.liveThinkSession;
    }
    if (this.message.thinkSession) {
       return typeof this.message.thinkSession === 'string' 
         ? JSON.parse(this.message.thinkSession) 
         : this.message.thinkSession;
    }
    return undefined;
  }

  // Teks bersih siap render
  get cleanText(): string {
     if (this.message.isStreaming && this.liveText !== undefined) {
        return this.liveText;
     }
     return this.message.text || '';
  }

  get hasVisibleThinkSteps(): boolean {
    const session = this.activeThinkSession;
    if (!session || !session.steps) return false;
    
    // Tampilkan jika belum selesai, atau jika ada step yang berguna (bukan skipped)
    if (!session.isComplete) return true;
    
    return session.steps.some(s => s.status !== 'skipped');
  }

  ngOnInit() {
    this.isUser = this.message.role === 'user';
  }
}
