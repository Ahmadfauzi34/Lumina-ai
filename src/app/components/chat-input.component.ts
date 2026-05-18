import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import type { Attachment } from '../types';

@Component({
  selector: 'app-chat-input',
  standalone: true,
  imports: [CommonModule, FormsModule],
  styles: [':host { display: block; flex-shrink: 0; width: 100%; }'],
  template: `
    <div class="input-area">
      <!-- Attachment List -->
      <div class="flex gap-2 mb-3 overflow-x-auto scrollbar-hidden pb-1" *ngIf="attachments.length > 0">
        <div *ngFor="let att of attachments; let i = index" 
             class="flex-shrink-0 relative group bg-white/80 border border-slate-200/80 rounded-xl p-1.5 pr-8 flex items-center gap-2.5 shadow-sm">
             
          <div *ngIf="att.isText" class="w-9 h-9 rounded-lg bg-indigo-50 flex items-center justify-center text-indigo-600">
            <svg class="w-[18px] h-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
          </div>
          <div *ngIf="!att.isText" class="w-9 h-9 rounded-lg bg-slate-100 overflow-hidden shadow-inner flex items-center justify-center border border-slate-200/50">
            <img [src]="'data:' + att.mimeType + ';base64,' + att.data" [alt]="att.name" class="w-full h-full object-cover" />
          </div>
          
          <div class="flex flex-col justify-center">
            <span class="text-[12px] font-semibold text-slate-800 truncate w-[75px]">{{ att.name }}</span>
            <span class="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-none mt-0.5">{{ att.isText ? 'Doc' : 'Img' }}</span>
          </div>
          <button type="button" (click)="onRemoveAttachment.emit(i)" aria-label="Hapus Lampiran"
            class="absolute right-1.5 top-1/2 -translate-y-1/2 w-6 h-6 flex items-center justify-center rounded-full text-slate-400 hover:text-rose-500 hover:bg-rose-50 transition-colors shadow-sm bg-white">
            <svg class="w-3.5 h-3.5" stroke-width="2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
      </div>

      <form (submit)="onSubmit($event)" class="input-form" [ngClass]="{'focus': isFocused}">
        <input type="file" #fileInput (change)="onFileChange($event)" class="hidden" multiple />
        <button type="button" (click)="fileInput.click()" class="input-btn" title="Lampirkan File" aria-label="Lampirkan File">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>
        </button>

        <textarea #textareaRef aria-label="Pesan Chat"
          [(ngModel)]="input"
          (ngModelChange)="onInputChange.emit($event)"
          (keydown)="handleKeyDown($event, textareaRef)"
          (focus)="isFocused = true"
          (blur)="isFocused = false"
          name="input"
          placeholder="Yuk, tulis atau buat sesuatu bersama..."
          class="input-textarea"
          rows="1"
          [disabled]="isLoading"></textarea>

        <button *ngIf="!input.trim() && attachments.length === 0 && !isLoading" type="button" class="input-btn" title="Gunakan Suara" aria-label="Gunakan Suara">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>
        </button>

        <button type="submit" aria-label="Kirim Pesan"
          [disabled]="isDisabled()"
          class="btn-send"
          [ngClass]="{'disabled': isDisabled(), 'generating': isLoading}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
        </button>
      </form>
    </div>
  `
})
export class ChatInputComponent {
  @Input() input = '';
  @Input() isLoading = false;
  @Input() attachments: Attachment[] = [];
  
  @Output() onInputChange = new EventEmitter<string>();
  @Output() submitChat = new EventEmitter<void>();
  @Output() onAddAttachments = new EventEmitter<FileList>();
  @Output() onRemoveAttachment = new EventEmitter<number>();

  isFocused = false;

  isDisabled() {
    return (!this.input.trim() && this.attachments.length === 0) || this.isLoading;
  }

  handleKeyDown(e: KeyboardEvent, textarea: HTMLTextAreaElement) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!this.isDisabled()) {
        this.onSubmit(e);
        textarea.style.height = 'auto';
      }
    } else {
      setTimeout(() => {
        textarea.style.height = 'auto';
        textarea.style.height = Math.min(textarea.scrollHeight, 120) + 'px';
      }, 0);
    }
  }

  onFileChange(event: Event) {
    const input = event.target as HTMLInputElement;
    if (input.files) {
      this.onAddAttachments.emit(input.files);
      input.value = '';
    }
  }

  onSubmit(event: Event) {
    event.preventDefault();
    if (!this.isDisabled()) {
      this.submitChat.emit();
    }
  }
}

