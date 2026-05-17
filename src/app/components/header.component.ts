import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [CommonModule],
  styles: [':host { display: block; flex-shrink: 0; width: 100%; }'],
  template: `
    <header class="chat-header">
      <div class="header-left">
        <button class="hamburger" (click)="onToggleSidebar.emit()">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="4" y1="7" x2="20" y2="7"/><line x1="4" y1="12" x2="14" y2="12"/><line x1="4" y1="17" x2="20" y2="17"/></svg>
        </button>
        <div class="header-center">
          <span class="header-title">Lumina</span>
        </div>
      </div>
      <div class="header-right relative">
        <div class="relative">
          <button class="model-badge" (click)="isModelDropdownOpen = !isModelDropdownOpen">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 2a10 10 0 1 0 10 10H12V2z"/><path d="M12 12L2.5 7.5"/></svg>
            <span>{{ currentModelName }}</span>
            <svg class="w-3 h-3 transition-transform" [ngClass]="{'rotate-180': isModelDropdownOpen}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
          </button>

          <ng-container *ngIf="isModelDropdownOpen">
            <div class="fixed inset-0 z-40" (click)="isModelDropdownOpen = false"></div>
            <div class="absolute right-0 top-full mt-2 w-48 bg-white rounded-xl shadow-xl border border-slate-100 overflow-hidden z-50 py-1">
              <button *ngFor="let m of models" 
                (click)="selectModel(m.id)"
                class="w-full text-left px-4 py-2.5 text-sm hover:bg-slate-50 flex items-center justify-between">
                <span class="font-medium" [ngClass]="currentModelId === m.id ? 'text-indigo-600' : 'text-slate-700'">{{ m.name }}</span>
                <svg *ngIf="currentModelId === m.id" class="w-4 h-4 text-indigo-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>
              </button>
            </div>
          </ng-container>
        </div>
      </div>
    </header>
  `
})
export class HeaderComponent {
  @Input() models: { id: string, name: string }[] = [];
  @Input() currentModelId = '';
  @Input() currentModelName = '';

  @Output() onToggleSidebar = new EventEmitter<void>();
  @Output() onModelSelect = new EventEmitter<string>();

  isModelDropdownOpen = false;

  selectModel(id: string) {
    this.onModelSelect.emit(id);
    this.isModelDropdownOpen = false;
  }
}

