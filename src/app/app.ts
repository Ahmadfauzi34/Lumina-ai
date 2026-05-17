import { ChangeDetectionStrategy, Component, ElementRef, OnInit, ViewChild, ChangeDetectorRef, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { BehaviorSubject } from 'rxjs';
import { dbQuery, generateId } from './utils';
import { DatabaseService, ChatSessionDB, ChatMessageDB, db } from './core/services/db.service';
import { GeminiService } from './core/services/gemini.service';
import { FileProcessingService } from './core/services/files.service';
import type { Message, Attachment } from './types';
import { toolRegistry } from './tools/registry';
import { MarkdownRendererComponent } from './shared/components/markdown-renderer';
import { ThinkSession, ThinkStep, ThinkStatus } from './agent-think-stream';
import { AgentStreamOrchestrator } from './agent-stream-orchestrator';
import { agentEventBus } from './agent/agent-event-bus';
import { InteractiveTaskComponent } from './shared/components/interactive-task.component';
import { SidebarComponent } from './components/sidebar.component';
import { HeaderComponent } from './components/header.component';
import { WelcomeComponent } from './components/welcome.component';
import { ChatInputComponent } from './components/chat-input.component';
import { ChatMessageComponent } from './components/chat-message.component';
import { PythonSkillsModalComponent } from './components/python-skills-modal.component';

// migrated components: Sidebar, Header, Welcome, ChatInput, ChatMessage

// --- Main App Component ---
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, SidebarComponent, ChatInputComponent, ChatMessageComponent, HeaderComponent, WelcomeComponent, InteractiveTaskComponent, PythonSkillsModalComponent],
  template: `
    <div class="shell">
      <app-sidebar 
        [isOpen]="isSidebarOpen" 
        [sessions]="sessions" 
        [currentSessionId]="currentSessionId"
        [filePaths]="filePaths"
        (onClose)="isSidebarOpen = false"
        (onCreateSession)="createNewSession()"
        (onSwitchSession)="switchSession($event)"
        (onDeleteSession)="deleteSession($event)"
        (downloadFile)="downloadFile($event)"
        (deleteFile)="deleteWorkspaceFile($event)"
        (onOpenPythonSkills)="isPythonSkillsModalOpen = true"
      ></app-sidebar>
      
      <app-header
        [models]="MODELS"
        [currentModelId]="model"
        [currentModelName]="getModelName(model)"
        (onToggleSidebar)="isSidebarOpen = true"
        (onModelSelect)="setModel($event)"
      ></app-header>

      <main class="main-area">
        <ng-container *ngIf="!hasMessages()">
          <app-welcome (onSuggestion)="handleSuggestion($event)"></app-welcome>
        </ng-container>

        <ng-container *ngIf="hasMessages()">
          <div class="chat-view active" style="display: flex;">
            <div class="messages-area" #scrollRef (scroll)="onScroll()">
              <app-chat-message 
                *ngFor="let msg of displayMessages; trackBy: trackByMsgId" 
                [message]="msg"
                [liveThinkSession]="msg.isStreaming ? liveThinkSession() : undefined"
                [liveText]="msg.isStreaming ? liveCleanText() : undefined">
              </app-chat-message>
              
              <app-interactive-task class="block w-full max-w-3xl mx-auto my-4 transition-all" />
              
              <div *ngIf="isLoading && !isModelStreaming" class="message ai mt-4">
                 <div class="msg-identity">
                   <div class="msg-avatar ai-av"><svg class="w-3.5 h-3.5 text-white" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2L9.19 8.63L2 9.24L7.46 13.97L5.82 21L12 17.27L18.18 21L16.54 13.97L22 9.24L14.81 8.63L12 2Z"/></svg></div>
                   <span class="msg-name">Lumina ✨</span>
                 </div>
                 <div class="msg-content">
                   <span class="inline-block w-[6px] h-[14px] ml-1 bg-indigo-500 animate-pulse opacity-80"></span>
                 </div>
              </div>
            </div>
          </div>
        </ng-container>

        <app-chat-input
          [input]="currentInput"
          [isLoading]="isLoading"
          [attachments]="attachments"
          (onInputChange)="currentInput = $event"
          (submitChat)="handleSubmit()"
          (onAddAttachments)="addAttachments($event)"
          (onRemoveAttachment)="removeAttachment($event)"
        ></app-chat-input>
      </main>

      <app-python-skills-modal *ngIf="isPythonSkillsModalOpen" (close)="isPythonSkillsModalOpen = false"></app-python-skills-modal>
    </div>
  `
})
export class App implements OnInit {
  isSidebarOpen = false;
  isPythonSkillsModalOpen = false;
  isModelDropdownOpen = false;
  currentInput = '';
  isLoading = false;
  isUserScrolledUp = false;
  
  thinkSession?: ThinkSession;
  currentParsedReport?: any;

  MODELS = [
    { id: 'gemini-3-flash-preview', name: 'Gemini 3 Flash' },
    { id: 'gemini-3.1-pro-preview', name: 'Gemini 3.1 Pro' },
    { id: 'gemini-3.1-flash-lite-preview', name: 'Gemini 3.1 Flash Lite' },
    { id: 'gemma-4-31b-it', name: 'Gemma 4 31B' },
    { id: 'gemma-4-26b-a4b-it', name: 'Gemma 4 26B' }
  ];
  model = 'gemini-3-flash-preview';

  sessions: ChatSessionDB[] = [];
  currentSessionId = generateId();
  dbMessages: ChatMessageDB[] = [];
  filePaths: string[] = [];
  attachments: Attachment[] = [];

  streamingMsgId: string | null = null;
  streamingText = '';
  isModelStreaming = false;

  INITIAL_MESSAGE: Message = {
    id: generateId(),
    role: 'model',
    text: 'Halo! Ada yang bisa saya bantu hari ini?',
  };

  @ViewChild('scrollRef') scrollRef!: ElementRef;

  private dbService = inject(DatabaseService);
  private gemini = inject(GeminiService);
  private fileProcessor = inject(FileProcessingService);
  private cdr = inject(ChangeDetectorRef);
  private streamOrchestrator = inject(AgentStreamOrchestrator);
  
  protected liveThinkSession = this.streamOrchestrator.thinkSession;
  protected liveCleanText = signal<string>('');

  private sessionId$ = new BehaviorSubject<string>(this.currentSessionId);

  async ngOnInit() {
    await this.gemini.loadSystemInstruction();
    console.log('Gemini Functions schemas:', JSON.stringify(toolRegistry.toGeminiFunctions(), null, 2));
    
    // Switch to reactive queries instead of polling
    if (typeof window !== 'undefined' && typeof window.indexedDB !== 'undefined') {
      import('./core/services/db.service').then(({ db }) => {
        // Sessions
        dbQuery(() => db.sessions.orderBy('updatedAt').reverse().toArray()).subscribe(sessions => {
          this.sessions = sessions;
          this.cdr.detectChanges();
        });

        // Messages react to sessionId changes
        this.sessionId$.subscribe(id => {
          dbQuery(() => db.messages.where('sessionId').equals(id).sortBy('createdAt')).subscribe(messages => {
            const didChange = messages.length !== this.dbMessages.length;
            this.dbMessages = messages;
            this.cdr.detectChanges();
            if (didChange) {
              this.scrollToBottom();
            }
          });
        });

        // Files
        dbQuery(() => db.files.orderBy('path').keys()).subscribe(paths => {
          this.filePaths = paths as string[];
          this.cdr.detectChanges();
        });
      });
    }
  }

  get displayMessages(): Message[] {
    const list = this.dbMessages.map(m => ({
      id: m.id,
      role: m.role,
      text: this.streamingMsgId === m.id ? this.streamingText : m.text,
      isStreaming: this.streamingMsgId === m.id ? true : m.isStreaming,
      attachments: m.attachments ? JSON.parse(m.attachments) : undefined,
      thinkSession: m.thinkSession
    }));
    return [this.INITIAL_MESSAGE, ...list];
  }

  hasMessages() {
    return this.displayMessages.some(m => m.role === 'user');
  }

  getModelName(id: string) {
    return this.MODELS.find(m => m.id === id)?.name || 'Gemini 3.0 Flash';
  }

  setModel(id: string) {
    this.model = id;
    this.isModelDropdownOpen = false;
  }

  async createNewSession() {
    this.currentSessionId = generateId();
    this.sessionId$.next(this.currentSessionId);
  }

  async switchSession(id: string) {
    this.currentSessionId = id;
    this.sessionId$.next(this.currentSessionId);
  }

  async deleteSession(id: string) {
    await this.dbService.deleteSession(id);
    if (this.currentSessionId === id) {
      this.currentSessionId = generateId();
      this.sessionId$.next(this.currentSessionId);
    }
  }

  async downloadFile(path: string) {
    if (typeof window === 'undefined' || typeof window.indexedDB === 'undefined') return;
    const { db } = await import('./core/services/db.service');
    const file = await db.files.get(path);
    if (!file) return;
    const blob = new Blob([file.content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = path.split('/').pop() || 'download';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  async deleteWorkspaceFile(path: string) {
    if (typeof window === 'undefined' || typeof window.indexedDB === 'undefined') return;
    const { db } = await import('./core/services/db.service');
    await db.files.delete(path);
  }

  handleSuggestion(text: string) {
    this.currentInput = text;
    this.handleSubmit();
  }

  async addAttachments(files: FileList) {
    const processed = await this.fileProcessor.processFiles(files);
    this.attachments = [...this.attachments, ...processed];
  }

  removeAttachment(index: number) {
    this.attachments.splice(index, 1);
  }

  trackByMsgId(index: number, msg: Message): string {
    return msg.id;
  }

  onScroll() {
    if (!this.scrollRef?.nativeElement) return;
    const el = this.scrollRef.nativeElement;
    // add a small 5px buffer
    this.isUserScrolledUp = el.scrollHeight - el.scrollTop - el.clientHeight > 5;
  }

  scrollToBottom(force = false) {
    setTimeout(() => {
      if (this.scrollRef?.nativeElement) {
        const el = this.scrollRef.nativeElement;
        if (force || !this.isUserScrolledUp) {
          el.scrollTop = el.scrollHeight;
        }
      }
    }, 50);
  }

  buildChatHistory(dbMessages: any[], userMsgId: string, modelMsgId: string) {
    return dbMessages
      .filter((m: any) => (m.text || m.attachments || m.thinkSession) && m.id !== userMsgId && m.id !== modelMsgId)
      .map((m: any) => {
        let parts: any[] = [];
        let attachments: any[] = [];
        if (m.attachments) {
          try {
            attachments = JSON.parse(m.attachments);
          } catch (e) {}
        }
        
        let textContent = m.text || '';
        
        if (m.role === 'model' && m.thinkSession) {
          try {
            const thinkData = typeof m.thinkSession === 'string' ? JSON.parse(m.thinkSession) : m.thinkSession;
            if (thinkData.steps && thinkData.steps.length > 0) {
              let logContent = '<agent_past_logs>\n';
              const extractSteps = (steps: any[], indent = '') => {
                let res = '';
                for (const step of steps) {
                  res += `${indent}- [${step.label}] ${step.description ? step.description.trim() : ''}\n`;
                  if (step.subSteps && step.subSteps.length > 0) {
                    res += extractSteps(step.subSteps, indent + '  ');
                  }
                }
                return res;
              };
              logContent += extractSteps(thinkData.steps);
              logContent += '</agent_past_logs>\n\n';
              textContent = logContent + textContent;
            }
          } catch(e) {}
        }
        
        // Use gemini service's method to correctly format parts
        parts = this.gemini.buildMessageParts(textContent, attachments);

        // Ensure text parts are correctly formatted as {text: '...'} for history if needed, 
        // though buildMessageParts currently returns strings which is usually fine.
        // We will just map strings to {text: s} to be completely safe for the history API format.
        const safeParts = parts.map(p => typeof p === 'string' ? { text: p } : p);

        return {
          role: m.role,
          parts: safeParts
        };
      });
  }

  handleMessageAction(action: any) {
    if (this.isLoading) return;
    this.currentInput = `Aksi dipilih: ${action.label}`;
    this.handleSubmit();
  }

  async handleSubmit() {
    const text = this.currentInput.trim();
    if ((!text && this.attachments.length === 0) || this.isLoading) return;
    
    this.currentInput = '';
    const atts = [...this.attachments];
    this.attachments = [];
    this.isLoading = true;
    this.scrollToBottom(true);

    try {
      if (this.sessions.findIndex(s => s.id === this.currentSessionId) === -1) {
        await this.dbService.createSession(this.currentSessionId, text.length > 30 ? text.substring(0, 30) + '...' : text, this.model);
      }

      const userMsgId = generateId();
      await this.dbService.saveMessage(this.currentSessionId, { id: userMsgId, role: 'user', text, attachments: atts });
      
      const modelMsgId = generateId();
      await this.dbService.saveMessage(this.currentSessionId, { id: modelMsgId, role: 'model', text: '', isStreaming: true });
      
      this.streamingMsgId = modelMsgId;
      this.streamingText = '';
      this.liveCleanText.set('');
      this.isModelStreaming = true;
      
      // Update local state instead of waiting for DB query to prevent UI lag
      this.dbMessages = [...this.dbMessages, 
        { id: userMsgId, role: 'user', text, attachments: JSON.stringify(atts) } as any,
        { id: modelMsgId, role: 'model', text: '', isStreaming: true } as any
      ];
      this.cdr.markForCheck();

      const history = this.buildChatHistory(this.dbMessages, userMsgId, modelMsgId);
      const toolsDef = toolRegistry.toGeminiFunctions();
      
      const session = this.gemini.createChatSession({
        model: this.model,
        tools: toolsDef.length > 0 ? [{ functionDeclarations: toolsDef }, { googleSearch: {} }] : [{ googleSearch: {} }],
        toolConfig: {
          functionCallingConfig: { mode: 'AUTO' },
          include_server_side_tool_invocations: true,
          includeServerSideToolInvocations: true
        }
      }, history);

      agentEventBus.next({ id: generateId(), type: 'session.init', timestamp: new Date().toISOString() });

      // 1. TEMBAK EVENT THINK.START SECARA INSTAN! (Memaksa Board Muncul)
      agentEventBus.next({
        id: 'main-think-step', 
        type: 'think.start', 
        timestamp: new Date().toISOString(),
        metadata: { agentId: 'main-agent' },
        payload: { label: '[Lumina] Merumuskan Rencana' }
      });

      const runTurn = async (messagePayload: any) => {
        const stream = await session.sendMessageStream(messagePayload);
        const currentToolResponses: any[] = [];

        for await (const chunk of stream) {
          const chunkText = chunk.text;
          if (chunkText) {
            this.streamingText += chunkText;

            // 2. AMBIL ISI PIKIRAN SECARA REAL-TIME
            let desc = '';
            const thinkMatch = this.streamingText.match(/<think>([\s\S]*?)(?:<\/think>|$)/i);
            if (thinkMatch) {
              desc = thinkMatch[1].trim();
            }
            
            if (desc) {
              agentEventBus.next({
                id: 'main-think-step', type: 'think.chunk', timestamp: new Date().toISOString(),
                metadata: { agentId: 'main-agent' },
                payload: { description: desc } 
              });
            }

            // 3. TUTUP BOARD JIKA TAG </think> TERDETEKSI ATAU JIKA TIDAK ADA <think> SAMA SEKALI
            if (!this.streamingText.includes('_board_closed_')) {
              // Jika terdeteksi </think>
              if (this.streamingText.toLowerCase().includes('</think>')) {
                agentEventBus.next({
                  id: 'main-think-step', type: 'think.end', timestamp: new Date().toISOString(),
                  metadata: { agentId: 'main-agent' },
                  payload: {}
                });
                this.streamingText += '\n_board_closed_';
              } 
              // Jika sudah stream masuk beberapa karakter dan TIDAK diawali <think>, tutup board secepatnya
              else if (this.streamingText.length > 20 && !this.streamingText.trimStart().startsWith('<think>')) {
                agentEventBus.next({
                  id: 'main-think-step', type: 'think.end', timestamp: new Date().toISOString(),
                  metadata: { agentId: 'main-agent' },
                  payload: { result: 'No thinking process' } // or something
                });
                this.streamingText += '\n_board_closed_';
              }
            }

            // Teks Bersih untuk UI Chat Markdown (Tanpa tag <think> dan marker internal)
            let currentClean = this.streamingText.replace(/<think>[\s\S]*?(?:<\/think>|$)/gi, '').trim();
            currentClean = currentClean.replace(/_board_closed_/gi, '').trim();
            this.liveCleanText.set(currentClean);
          }

          if (chunk.functionCalls && chunk.functionCalls.length > 0) {
            for (const call of chunk.functionCalls) {
              const callId = call.id || generateId();
              
              agentEventBus.next({
                id: callId,
                type: 'tool.start',
                timestamp: new Date().toISOString(),
                metadata: { agentId: 'main-agent' },
                payload: { toolName: call.name, params: call.args }
              });
              
              try {
                const result = await toolRegistry.execute({
                  id: callId,
                  name: call.name,
                  arguments: call.args as Record<string, unknown>
                });
                
                if (result.status === 'error') {
                  const errorMsg = result.output || (result as any).error || 'Unknown error occurred processing tool';
                  agentEventBus.next({
                    id: callId,
                    type: 'tool.error',
                    timestamp: new Date().toISOString(),
                    metadata: { agentId: 'main-agent' },
                    payload: { error: errorMsg }
                  });

                  currentToolResponses.push({
                     id: call.id,
                     name: call.name,
                     response: { error: errorMsg, status: 'error' }
                  });
                } else {
                  agentEventBus.next({
                    id: callId,
                    type: 'tool.result',
                    timestamp: new Date().toISOString(),
                    metadata: { agentId: 'main-agent' },
                    payload: { result: result.output }
                  });

                  currentToolResponses.push({
                     id: call.id,
                     name: call.name,
                     response: { result: result.output, status: 'success' }
                  });
                }
              } catch (toolErr: any) {
                agentEventBus.next({
                  id: callId,
                  type: 'tool.error',
                  timestamp: new Date().toISOString(),
                  metadata: { agentId: 'main-agent' },
                  payload: { error: toolErr.message }
                });

                currentToolResponses.push({
                  id: call.id,
                  name: call.name,
                  response: { error: toolErr.message, status: 'error' }
                });
              }
            }
          }
          this.cdr.markForCheck();
        }

        if (currentToolResponses.length > 0) {
           const toolPayload = {
               message: currentToolResponses.map(tr => ({
                   functionResponse: {
                       id: tr.id,
                       name: tr.name,
                       response: tr.response
                   }
               }))
           };
           await runTurn(toolPayload);
        }
      };

      await runTurn({ message: this.gemini.buildMessageParts(text, atts) });
      
      // FALLBACK: TUTUP BOARD JIKA BELUM DITUTUP AGAR TIDAK SPIN TERUS
      agentEventBus.next({
        id: 'main-think-step', type: 'think.end', timestamp: new Date().toISOString(),
        metadata: { agentId: 'main-agent' },
        payload: {}
      });

      agentEventBus.next({ id: generateId(), type: 'session.complete', timestamp: new Date().toISOString() });

      const finalCleanText = this.streamingText.replace(/<think>[\s\S]*?(?:<\/think>|$)/gi, '').replace(/_board_closed_/gi, '').trim();
      const finalThinkData = this.liveThinkSession();
      
      await this.dbService.updateMessageText(
        modelMsgId, 
        finalCleanText, 
        false, 
        finalThinkData ? JSON.stringify(finalThinkData) : undefined
      );

    } catch (err: any) {
      console.error(err);
      agentEventBus.next({
        id: generateId(), type: 'status.change', timestamp: new Date().toISOString(),
        payload: { error: err.message }
      });
      
      const finalCleanText = this.streamingText.replace(/<think>[\s\S]*?(?:<\/think>|$)/gi, '').replace(/_board_closed_/gi, '').trim();
      await this.dbService.updateMessageText(this.streamingMsgId || '', finalCleanText + `\n\n[Error: ${err.message}]`, false);
    } finally {
      // Perbarui secara lokal untuk mencegah flicker jika query Dexie lambat
      if (this.streamingMsgId) {
        const idx = this.dbMessages.findIndex(m => m.id === this.streamingMsgId);
        if (idx !== -1) {
          const finalCleanText = this.streamingText.replace(/<think>[\s\S]*?(?:<\/think>|$)/gi, '').replace(/_board_closed_/gi, '').trim();
          const finalThinkData = this.liveThinkSession();
          this.dbMessages[idx] = { 
            ...this.dbMessages[idx], 
            text: finalCleanText, 
            isStreaming: false,
            thinkSession: finalThinkData ? JSON.stringify(finalThinkData) : undefined
          };
        }
      }
      this.streamingMsgId = null;
      this.isModelStreaming = false;
      this.liveCleanText.set('');
      this.isLoading = false;
      this.cdr.markForCheck();
    }
  }
}
