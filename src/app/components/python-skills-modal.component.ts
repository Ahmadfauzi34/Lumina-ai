import { Component, EventEmitter, Output, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { db, type PythonSkillDB } from '../core/services/db.service';

@Component({
  selector: 'app-python-skills-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div class="bg-slate-900 rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col border border-slate-700 overflow-hidden">
        
        <!-- Header -->
        <div class="px-5 py-4 border-b border-slate-700 flex justify-between items-center bg-slate-800/50">
          <div class="flex items-center gap-3">
            <div class="p-2 bg-emerald-500/20 rounded-lg">
              <svg class="w-5 h-5 text-emerald-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
              </svg>
            </div>
            <div>
              <h2 class="text-base md:text-lg font-semibold text-white">External Python Skills</h2>
              <p class="text-[10px] md:text-xs text-slate-400">Manage skill secara persisten untuk execute_python</p>
            </div>
          </div>
          <div class="flex items-center gap-2">
            <button (click)="isMobileNavOpen = !isMobileNavOpen" class="md:hidden text-slate-400 hover:text-emerald-400 p-2 rounded-lg hover:bg-slate-700/50 transition-colors">
              <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="4" y1="6" x2="20" y2="6"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="18" x2="20" y2="18"/></svg>
            </button>
            <button (click)="close.emit()" class="text-slate-400 hover:text-white p-2 rounded-lg hover:bg-slate-700/50 transition-colors">
              <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
        </div>

        <div class="flex flex-1 overflow-hidden min-h-[400px] md:min-h-[500px] relative">
          <!-- Mobile Overlay -->
          <div *ngIf="isMobileNavOpen" (click)="isMobileNavOpen = false" class="md:hidden absolute inset-0 bg-black/60 z-10"></div>
          
          <!-- Sidebar: List of Skills -->
          <div class="w-64 border-l md:border-l-0 md:border-r border-slate-700 flex-col bg-slate-900 shrink-0 absolute right-0 top-0 bottom-0 z-20 md:static transition-transform duration-300 shadow-2xl md:shadow-none"
               [ngClass]="[isMobileNavOpen ? 'translate-x-0' : 'translate-x-[110%] md:translate-x-0', selectedSkill ? 'hidden md:flex' : 'flex']">
            <div class="p-3">
              <button (click)="createNewSkill()" class="w-full py-2 px-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2">
                <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                Buat Skill Baru
              </button>
            </div>
            <div class="flex-1 overflow-y-auto p-2 space-y-1">
              <div *ngIf="skills.length === 0" class="text-center p-4 text-xs text-slate-500 italic">
                Belum ada skill.
              </div>
              <button *ngFor="let s of skills" 
                      (click)="selectSkill(s)"
                      class="w-full text-left px-3 py-2 rounded-lg text-sm transition-colors flex items-center justify-between group"
                      [ngClass]="s.id === selectedSkill?.id ? 'bg-slate-800 text-emerald-400' : 'text-slate-300 hover:bg-slate-800/50'">
                <div class="truncate pr-2 py-1 flex-1">
                   <div class="font-medium truncate">{{ s.name }}</div>
                   <div class="text-[10px] text-slate-500 font-mono truncate">{{ s.id }}</div>
                </div>
                <div class="flex items-center gap-1 opacity-100 md:opacity-0 group-hover:opacity-100 transition-opacity">
                   <div class="h-2 w-2 rounded-full" [ngClass]="s.isEnabled ? 'bg-emerald-500' : 'bg-slate-600'" title="Toggle (in editor)"></div>
                </div>
              </button>
            </div>
          </div>

          <!-- Main Content: Editor -->
          <div class="flex-1 flex flex-col bg-slate-950 overflow-hidden relative w-full">
            <div *ngIf="!selectedSkill" class="absolute inset-0 flex flex-col items-center justify-center text-slate-500 text-sm p-4 text-center">
              <div class="w-16 h-16 rounded-full bg-slate-800/50 flex items-center justify-center mb-4 text-slate-600 border border-slate-700/50">
                <svg class="w-8 h-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                   <path stroke-linecap="round" stroke-linejoin="round" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                </svg>
              </div>
              <p class="mb-2">Pilih skill dari menu untuk mengedit</p>
              <button (click)="isMobileNavOpen = true" class="md:hidden mt-2 text-emerald-400 hover:text-emerald-300 py-2 px-4 rounded border border-emerald-500/30 font-medium">Buka Menu Skills</button>
            </div>
            
            <div *ngIf="selectedSkill" class="flex flex-col h-full overflow-y-auto w-full">
              <!-- Editor Header -->
              <div class="p-3 md:p-4 border-b border-slate-800 space-y-3 bg-slate-900/50 shrink-0">
                <div class="flex flex-col xl:flex-row gap-3">
                  <div class="flex-1 space-y-1">
                     <label class="text-[10px] uppercase font-bold text-slate-500 tracking-wider">File Name (ID)</label>
                     <input type="text" [(ngModel)]="selectedSkill.id" [disabled]="!isNew" class="w-full bg-slate-950/80 border border-slate-700 rounded-md px-3 py-1.5 md:py-2 text-sm text-white focus:outline-none focus:border-emerald-500 font-mono" placeholder="my_skill.py">
                  </div>
                  <div class="flex-1 space-y-1">
                     <label class="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Skill Name</label>
                     <input type="text" [(ngModel)]="selectedSkill.name" class="w-full bg-slate-950/80 border border-slate-700 rounded-md px-3 py-1.5 md:py-2 text-sm text-white focus:outline-none focus:border-emerald-500" placeholder="My Awesome Skill">
                  </div>
                </div>
                <div class="space-y-1">
                   <label class="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Description</label>
                   <input type="text" [(ngModel)]="selectedSkill.description" class="w-full bg-slate-950/80 border border-slate-700 rounded-md px-3 py-1.5 md:py-2 text-sm text-white focus:outline-none focus:border-emerald-500" placeholder="What does this do?">
                </div>
                <div class="flex items-center gap-2 pt-1">
                  <input type="checkbox" id="skillEnabled" [(ngModel)]="selectedSkill.isEnabled" class="w-4 h-4 rounded border-slate-700 text-emerald-500 focus:ring-emerald-500 focus:ring-offset-slate-900 bg-slate-950">
                  <label for="skillEnabled" class="text-[13px] md:text-sm text-slate-300 select-none cursor-pointer">Enable skill ini di agen AI</label>
                </div>
              </div>

              <!-- Editor Body -->
              <div class="flex-1 flex flex-col p-4">
                <label class="text-[10px] uppercase font-bold text-slate-500 tracking-wider mb-2">Python Code</label>
                <textarea [(ngModel)]="selectedSkill.code" class="flex-1 w-full bg-slate-950 border border-slate-700 rounded-md p-4 text-sm text-emerald-100/90 focus:outline-none focus:border-emerald-500 font-mono resize-none" placeholder="def my_helpful_function():\n    return 'Hello'"></textarea>
              </div>

              <!-- Editor Footer -->
              <div class="p-4 border-t border-slate-800 bg-slate-900/50 flex justify-between items-center">
                <button *ngIf="!isNew" (click)="deleteSkill()" class="text-red-400 hover:text-red-300 text-sm hover:underline px-2 py-1 rounded">
                  Hapus Skill
                </button>
                <div *ngIf="isNew"></div>
                <div class="flex items-center gap-3">
                  <span *ngIf="saveMessage" class="text-xs text-emerald-400">{{ saveMessage }}</span>
                  <button (click)="saveSkill()" class="bg-emerald-600 hover:bg-emerald-500 text-white px-6 py-2 rounded-lg text-sm font-medium transition-colors">
                    Simpan Skill
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `
})
export class PythonSkillsModalComponent implements OnInit {
  @Output() close = new EventEmitter<void>();
  @Output() skillChanged = new EventEmitter<void>();

  skills: PythonSkillDB[] = [];
  selectedSkill: PythonSkillDB | null = null;
  isNew = false;
  saveMessage = '';
  isMobileNavOpen = false;

  async ngOnInit() {
    await this.loadSkills();
  }

  async loadSkills() {
    try {
      this.skills = await db.python_skills.toArray();
    } catch(e) {
      console.error(e);
    }
  }

  goBackToList() {
    this.selectedSkill = null;
    this.isNew = false;
  }

  createNewSkill() {
    this.isNew = true;
    this.selectedSkill = {
      id: '',
      name: 'New Skill',
      code: '',
      description: '',
      isEnabled: true,
      updatedAt: Date.now()
    };
    this.saveMessage = '';
  }

  selectSkill(skill: PythonSkillDB) {
    this.isNew = false;
    this.selectedSkill = { ...skill };
    this.saveMessage = '';
  }

  async saveSkill() {
    if (!this.selectedSkill || !this.selectedSkill.id.trim()) {
      alert("File Name (ID) tidak boleh kosong!");
      return;
    }
    if (!this.selectedSkill.id.endsWith('.py')) {
      this.selectedSkill.id += '.py';
    }

    try {
      this.selectedSkill.updatedAt = Date.now();
      await db.python_skills.put(this.selectedSkill);
      this.saveMessage = 'Berhasil disimpan!';
      
      const oldId = this.selectedSkill.id;
      await this.loadSkills();
      
      this.isNew = false;
      this.selectedSkill = this.skills.find(s => s.id === oldId) || null;
      this.skillChanged.emit();

      setTimeout(() => this.saveMessage = '', 3000);
    } catch(e) {
       console.error(e);
       alert("Gagal menyimpan skill.");
    }
  }

  async deleteSkill() {
    if (!this.selectedSkill || this.isNew) return;
    if (confirm(`Yakin ingin menghapus ${this.selectedSkill.id}?`)) {
      try {
        await db.python_skills.delete(this.selectedSkill.id);
        await this.loadSkills();
        this.selectedSkill = null;
        this.skillChanged.emit();
      } catch(e) {
        console.error(e);
      }
    }
  }
}
