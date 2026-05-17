import { Component, Output, EventEmitter } from '@angular/core';

@Component({
  selector: 'app-welcome',
  standalone: true,
  styles: [':host { display: block; flex: 1; width: 100%; min-height: 0; }'],
  template: `
    <div class="welcome-scroll-container w-full h-full overflow-y-auto flex flex-col p-6">
      <div class="welcome-inner flex flex-col items-center justify-center my-auto w-full min-h-max">
        <div class="orb-container mb-6 text-center flex justify-center w-full shrink-0">
          <div class="welcome-icon w-16 h-16 bg-indigo-600 flex items-center justify-center mx-auto">
            <svg class="w-8 h-8 text-white" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2L9.19 8.63L2 9.24L7.46 13.97L5.82 21L12 17.27L18.18 21L16.54 13.97L22 9.24L14.81 8.63L12 2Z"/></svg>
          </div>
        </div>
        <h1 class="text-2xl font-bold text-slate-800 text-center mb-2 shrink-0">Halo, saya Lumina</h1>
        <p class="text-sm text-slate-500 text-center max-w-[280px] mx-auto mb-8 line-height-[1.5] shrink-0">
          Asisten AI agentic Anda. Didukung oleh ✨ Gemini API.
        </p>
        
        <div class="suggestions w-full max-w-[600px] mx-auto shrink-0 pb-4">
          <div class="suggestion-chip" (click)="onSuggestion.emit('Buatkan file HTML sederhana berisi formulir login dengan desain minimalis.')">
            <div class="chip-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg></div>
            <div class="chip-text">
              <div class="chip-label">Tuliskan Kode</div>
              <div class="chip-desc">Buatkan kode file UI HTML/CSS.</div>
            </div>
          </div>
          <div class="suggestion-chip" (click)="onSuggestion.emit('Coba jelaskan teori Chain of Thought (CoT) dengan pendekatan yang mudah dipahami.')">
            <div class="chip-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg></div>
            <div class="chip-text">
              <div class="chip-label">Jelaskan Konsep</div>
              <div class="chip-desc">Pelajari mengenai Agentic AI.</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `
})
export class WelcomeComponent {
  @Output() onSuggestion = new EventEmitter<string>();
}

