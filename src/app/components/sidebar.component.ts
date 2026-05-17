import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ChatSessionDB } from '../core/services/db.service';

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="sidebar-overlay" [ngClass]="{'open': isOpen}" (click)="onClose.emit()"></div>
    <div class="sidebar" [ngClass]="{'open': isOpen}">
      <div class="sidebar-header">
        <div class="sidebar-top-row">
          <div class="sidebar-brand">
            <div class="sidebar-logo">
              <!-- logo -->
              <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2L9.19 8.63L2 9.24L7.46 13.97L5.82 21L12 17.27L18.18 21L16.54 13.97L22 9.24L14.81 8.63L12 2Z" /></svg>
            </div>
            <span class="sidebar-brand-text">Lumina</span>
          </div>
          <button class="sidebar-close" (click)="onClose.emit()">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <button class="new-chat-btn" (click)="onCreateSession.emit(); onClose.emit()">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> Chat Baru
        </button>
      </div>

      <div class="sidebar-label">Riwayat Chat</div>
      <div class="session-list-container">
        <div *ngFor="let session of sessions" 
             class="session-item" 
             [ngClass]="{'active': session.id === currentSessionId}"
             (click)="onSwitchSession.emit(session.id); onClose.emit()">
          <svg class="msg-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
          <div class="session-info">
            <div class="session-title">{{ session.title }}</div>
            <div class="session-date">{{ session.updatedAt | date:'shortDate' }}</div>
          </div>
          <button class="right-delete" (click)="$event.stopPropagation(); onDeleteSession.emit(session.id)" title="Hapus Chat">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
          </button>
        </div>
      </div>

      <div class="sidebar-label" style="display: flex; align-items: center; justify-content: space-between; cursor: pointer;" (click)="isFileContainerOpen = !isFileContainerOpen">
        <span>Workspace File AI</span>
        <div style="padding: 4px; border-radius: 6px; background: rgba(255,255,255,0.05);">
            <svg class="w-4 h-4 transition-transform text-slate-400" [ngClass]="{'rotate-180': isFileContainerOpen}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
        </div>
      </div>
      <div class="workspace-list" id="workspaceList" *ngIf="isFileContainerOpen">
        <div class="px-3 pb-2 pt-1 border-b border-slate-800 mb-2">
           <button (click)="onOpenPythonSkills.emit(); onClose.emit()" 
                   class="w-full text-left px-3 py-2 bg-slate-800 hover:bg-slate-700/80 rounded-lg text-[13px] text-slate-300 transition-colors flex items-center justify-between group">
             <div class="flex items-center gap-2">
               <svg class="w-4 h-4 text-emerald-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                 <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
               </svg>
               <span class="font-medium group-hover:text-emerald-400 transition-colors">Python Skills</span>
             </div>
             <svg class="w-3.5 h-3.5 opacity-50 relative top-[1px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
           </button>
        </div>
        <div *ngFor="let path of filePaths | slice:0:50" class="workspace-item justify-between group">
          <div class="flex items-center gap-2 overflow-hidden">
            <svg class="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
            <span class="workspace-filename truncate">{{ path }}</span>
          </div>
          <div class="flex items-center shrink-0">
            <button (click)="$event.stopPropagation(); downloadFile.emit(path)"
              class="p-1 rounded-md hover:bg-slate-700/50 transition-all text-slate-400 hover:text-white"
              title="Download File">
              <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            </button>
            <button (click)="$event.stopPropagation(); deleteFile.emit(path)"
              class="p-1 rounded-md hover:bg-red-500/20 transition-all text-slate-400 hover:text-red-400 ml-1"
              title="Hapus File">
              <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
            </button>
          </div>
        </div>
        <div *ngIf="filePaths.length > 50" class="text-[12px] text-slate-500 px-3 italic">
          + {{ filePaths.length - 50 }} file lainnya (tersembunyi)
        </div>
        <div *ngIf="filePaths.length === 0" class="text-[12px] text-slate-500 px-3 italic">Belum ada file.</div>
      </div>
    </div>
  `
})
export class SidebarComponent {
  @Input() isOpen = false;
  @Input() sessions: ChatSessionDB[] = [];
  @Input() currentSessionId = '';
  @Input() filePaths: string[] = [];

  isFileContainerOpen = false;

  @Output() onClose = new EventEmitter<void>();
  @Output() onCreateSession = new EventEmitter<void>();
  @Output() onSwitchSession = new EventEmitter<string>();
  @Output() onDeleteSession = new EventEmitter<string>();
  @Output() downloadFile = new EventEmitter<string>();
  @Output() deleteFile = new EventEmitter<string>();
  @Output() onOpenPythonSkills = new EventEmitter<void>();
}

