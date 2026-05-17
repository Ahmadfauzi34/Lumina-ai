import { Component, Input, OnChanges, SecurityContext, ViewEncapsulation, ChangeDetectorRef, HostListener, ElementRef } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { marked, Tokens } from 'marked';

interface AlertConfig {
  icon: string;
  borderColor: string;
  bgColor: string;
  titleColor: string;
  label: string;
}

@Component({
  selector: 'app-markdown-renderer',
  standalone: true,
  template: `<div class="markdown-body" [innerHTML]="safeHtml"></div>`,
  styles: [`
    /* ========== BASE ========== */
    .markdown-body {
      color: var(--text-main, #1e293b);
      line-height: 1.7;
      font-size: 15px;
    }
    
    /* ========== TYPOGRAPHY ========== */
    .markdown-body p { 
      margin-bottom: 1rem; 
      line-height: 1.75;
    }
    .markdown-body p.lead {
      font-size: 1.125rem;
      color: #475569;
      font-weight: 400;
    }
    
    /* ========== HEADINGS ========== */
    .markdown-body h1, .markdown-body h2, .markdown-body h3, 
    .markdown-body h4, .markdown-body h5, .markdown-body h6 {
      font-weight: 700;
      color: var(--text-main, #0f172a);
      margin-top: 2rem;
      margin-bottom: 0.75rem;
      line-height: 1.3;
      position: relative;
    }
    .markdown-body h1 { font-size: 1.75rem; border-bottom: 2px solid #e2e8f0; padding-bottom: 0.5rem; }
    .markdown-body h2 { font-size: 1.4rem; border-bottom: 1px solid #e2e8f0; padding-bottom: 0.4rem; }
    .markdown-body h3 { font-size: 1.2rem; }
    .markdown-body h4 { font-size: 1.1rem; }
    .markdown-body h5 { font-size: 1rem; }
    .markdown-body h6 { font-size: 0.9rem; color: #64748b; }
    
    .heading-anchor {
      float: left;
      margin-left: -1.5rem;
      padding-right: 0.5rem;
      text-decoration: none;
      opacity: 0;
      transition: opacity 0.2s;
      color: #94a3b8;
      font-weight: 400;
    }
    .markdown-body h1:hover .heading-anchor,
    .markdown-body h2:hover .heading-anchor,
    .markdown-body h3:hover .heading-anchor,
    .markdown-body h4:hover .heading-anchor,
    .markdown-body h5:hover .heading-anchor,
    .markdown-body h6:hover .heading-anchor { opacity: 1; }
    
    /* ========== LINKS ========== */
    .markdown-body a { 
      color: #4f46e5; 
      text-decoration: none; 
      border-bottom: 1px solid rgba(79, 70, 229, 0.3);
      transition: all 0.2s;
    }
    .markdown-body a:hover { 
      border-bottom-color: #4f46e5; 
      background: rgba(79, 70, 229, 0.04);
    }
    
    /* ========== LISTS ========== */
    .markdown-body ul, .markdown-body ol { 
      padding-left: 1.75rem; 
      margin: 1rem 0; 
    }
    .markdown-body ul { list-style: none; }
    .markdown-body ul > li {
      position: relative;
      margin-bottom: 0.6rem;
      padding-left: 0.25rem;
    }
    .markdown-body ul > li::before {
      content: '';
      position: absolute;
      left: -1.25rem;
      top: 0.6rem;
      width: 6px;
      height: 6px;
      background: #475569;
      border-radius: 50%;
    }
    .markdown-body ul ul > li::before {
      background: transparent;
      border: 2px solid #64748b;
      width: 5px;
      height: 5px;
    }
    .markdown-body ol { 
      list-style: decimal; 
    }
    .markdown-body ol > li { 
      margin-bottom: 0.6rem; 
      padding-left: 0.5rem; 
    }
    .markdown-body li > p { margin-bottom: 0.5rem; }
    .markdown-body li > ul, .markdown-body li > ol { margin: 0.5rem 0; }
    
    .markdown-body strong {
      font-weight: 800;
      color: #0f172a;
    }
    
    /* ========== TASK LISTS ========== */
    .task-list-item {
      list-style: none !important;
      padding-left: 0 !important;
    }
    .task-list-item::before { display: none !important; }
    .task-checkbox {
      appearance: none;
      -webkit-appearance: none;
      width: 1.1rem;
      height: 1.1rem;
      border: 2px solid #cbd5e1;
      border-radius: 4px;
      margin-right: 0.5rem;
      vertical-align: middle;
      cursor: default;
      position: relative;
      top: -1px;
    }
    .task-checkbox:checked {
      background: #4f46e5;
      border-color: #4f46e5;
    }
    .task-checkbox:checked::after {
      content: '';
      position: absolute;
      left: 3px;
      top: 0px;
      width: 5px;
      height: 9px;
      border: solid white;
      border-width: 0 2px 2px 0;
      transform: rotate(45deg);
    }
    .task-list-item.checked > span { opacity: 0.6; text-decoration: line-through; }
    
    /* ========== BLOCKQUOTES ========== */
    .markdown-body blockquote { 
      border-left: 4px solid #818cf8; 
      padding: 0.75rem 1rem; 
      color: #475569; 
      margin: 1.25rem 0;
      background: #f8fafc;
      border-radius: 0 8px 8px 0;
      font-style: italic;
    }
    .markdown-body blockquote p:last-child { margin-bottom: 0; }
    .markdown-body blockquote p:first-child { margin-top: 0; }
    
    /* ========== ALERTS / CALLOUTS ========== */
    .markdown-alert {
      padding: 1rem 1rem 1rem 3rem;
      border-radius: 8px;
      margin: 1.25rem 0;
      position: relative;
      border: 1px solid;
      font-style: normal;
      background: #fff;
    }
    .markdown-alert-icon {
      position: absolute;
      left: 1rem;
      top: 1rem;
      width: 1.25rem;
      height: 1.25rem;
    }
    .markdown-alert-title {
      font-weight: 700;
      margin-bottom: 0.5rem;
      font-size: 0.95rem;
      text-transform: uppercase;
      letter-spacing: 0.025em;
    }
    .markdown-alert p { margin-bottom: 0.5rem; }
    .markdown-alert p:last-child { margin-bottom: 0; }
    
    .markdown-alert-note { border-color: #3b82f6; background: #eff6ff; }
    .markdown-alert-note .markdown-alert-title { color: #1d4ed8; }
    
    .markdown-alert-tip { border-color: #22c55e; background: #f0fdf4; }
    .markdown-alert-tip .markdown-alert-title { color: #15803d; }
    
    .markdown-alert-important { border-color: #a855f7; background: #faf5ff; }
    .markdown-alert-important .markdown-alert-title { color: #7e22ce; }
    
    .markdown-alert-warning { border-color: #f59e0b; background: #fffbeb; }
    .markdown-alert-warning .markdown-alert-title { color: #b45309; }
    
    .markdown-alert-caution { border-color: #ef4444; background: #fef2f2; }
    .markdown-alert-caution .markdown-alert-title { color: #b91c1c; }
    
    /* ========== TABLES ========== */
    .markdown-body table { 
      width: 100%; 
      border-collapse: separate; 
      border-spacing: 0;
      margin: 1.25rem 0; 
      border-radius: 10px; 
      overflow: hidden; 
      border: 1px solid #e2e8f0;
      font-size: 14px;
    }
    .markdown-body th, .markdown-body td { 
      border-bottom: 1px solid #e2e8f0; 
      padding: 0.75rem 1rem; 
    }
    .markdown-body th { 
      background: #f1f5f9; 
      font-weight: 600; 
      text-align: left;
      color: #334155;
      font-size: 13px;
      text-transform: uppercase;
      letter-spacing: 0.025em;
    }
    .markdown-body tr:last-child td { border-bottom: none; }
    .markdown-body tr:hover td { background: #f8fafc; }
    .markdown-body td { transition: background 0.15s; }
    
    /* ========== HORIZONTAL RULE ========== */
    .markdown-body hr {
      border: none;
      height: 2px;
      background: linear-gradient(to right, transparent, #e2e8f0, transparent);
      margin: 2rem 0;
    }
    
    /* ========== IMAGES ========== */
    .markdown-body img {
      max-width: 100%;
      height: auto;
      border-radius: 10px;
      box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05), 0 2px 4px -2px rgba(0,0,0,0.05);
      margin: 1rem 0;
      display: block;
    }
    .image-wrapper {
      margin: 1.5rem 0;
      text-align: center;
    }
    .image-wrapper img {
      margin: 0 auto;
    }
    .image-caption {
      font-size: 13px;
      color: #64748b;
      margin-top: 0.5rem;
      font-style: italic;
    }
    
    /* ========== INLINE CODE ========== */
    .markdown-body code:not(pre code) {
      background: #f1f5f9;
      color: #334155;
      padding: 0.2em 0.4em;
      border-radius: 5px;
      font-size: 0.875em;
      font-family: 'JetBrains Mono', ui-monospace, SFMono-Regular, monospace;
      border: 1px solid #e2e8f0;
      word-break: break-word;
    }
    
    /* ========== CODE BLOCKS (MINIMALIST) ========== */
    .code-block-wrapper { 
      margin: 1rem 0; 
      border-radius: 10px; 
      overflow: hidden; 
      background: #111827; /* Dark elegant background */
      box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.1);
      position: relative;
    }
    .code-header { 
      display: flex; 
      justify-content: space-between; 
      align-items: center; 
      padding: 10px 14px; 
      background: #111827; 
      color: #9ca3af; 
      font-size: 11px; 
      font-family: ui-sans-serif, system-ui;
      font-weight: 500;
      letter-spacing: 0.05em;
      border-bottom: 1px solid rgba(255, 255, 255, 0.05);
      user-select: none;
    }
    .code-header-left {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .code-dots {
      display: flex;
      gap: 6px;
    }
    .code-dot {
      width: 10px;
      height: 10px;
      border-radius: 50%;
    }
    .code-dot-red { background: #ff5f56; }
    .code-dot-yellow { background: #ffbd2e; }
    .code-dot-green { background: #27c93f; }
    .code-filename {
      color: #d1d5db;
      font-weight: 600;
      text-transform: uppercase;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .copy-button {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 4px 8px;
      border-radius: 4px;
      cursor: pointer;
      transition: all 0.2s;
      background: rgba(255,255,255,0.05);
      color: #9ca3af;
      font-size: 10px;
      font-weight: 600;
      letter-spacing: 0.05em;
    }
    .copy-button:hover { 
      background: rgba(255,255,255,0.1); 
      color: #e5e7eb; 
    }
    .copy-button:active { transform: scale(0.96); }
    .copy-button svg { width: 12px; height: 12px; }
    .copy-hint {
      font-size: 10px;
      opacity: 0.5;
    }
    
    .markdown-body pre { 
      margin: 0 !important; 
      border: none !important; 
      border-radius: 0 !important; 
      background: transparent !important;
      overflow-x: hidden;
      white-space: pre-wrap;
      word-wrap: break-word;
    }
    
    .markdown-body pre code { 
      background: transparent !important; 
      color: #f3f4f6 !important; 
      padding: 16px 16px 12px 16px !important; 
      display: block; 
      font-family: 'JetBrains Mono', ui-monospace, SFMono-Regular, monospace; 
      font-size: 13.5px; 
      line-height: 1.7;
      white-space: pre-wrap;
      word-break: break-all;
    }
    
    /* Code Wrap Container */
    .code-with-lines {
      display: flex;
    }
    
    /* ========== DETAILS / SUMMARY ========== */
    .markdown-body details {
      border: 1px solid #e2e8f0;
      border-radius: 10px;
      padding: 0.75rem 1rem;
      margin: 1rem 0;
      background: #f8fafc;
    }
    .markdown-body summary {
      font-weight: 600;
      cursor: pointer;
      user-select: none;
      color: #334155;
    }
    .markdown-body summary:hover { color: #0f172a; }
    .markdown-body details[open] summary { margin-bottom: 0.75rem; }
    
    /* ========== DEFINITION LISTS ========== */
    .markdown-body dl {
      margin: 1rem 0;
      padding: 0;
    }
    .markdown-body dt {
      font-weight: 700;
      margin-top: 0.75rem;
      color: #0f172a;
    }
    .markdown-body dd {
      margin-left: 1.5rem;
      color: #475569;
    }
    
    /* ========== KBD ========== */
    .markdown-body kbd {
      background: #f1f5f9;
      border: 1px solid #cbd5e1;
      border-bottom-width: 2px;
      border-radius: 5px;
      padding: 0.15em 0.4em;
      font-family: 'JetBrains Mono', ui-monospace, SFMono-Regular, monospace;
      font-size: 0.8em;
      color: #334155;
    }
    
    /* ========== FOOTNOTES ========== */
    .footnotes {
      margin-top: 2rem;
      padding-top: 1rem;
      border-top: 2px solid #e2e8f0;
      font-size: 13px;
      color: #64748b;
    }
    .footnotes ol { padding-left: 1.25rem; }
    .footnotes li { margin-bottom: 0.5rem; }
    .footnote-backref { text-decoration: none; margin-left: 0.25rem; }
    
    /* ========== SCROLL INDICATOR ========== */
    .code-scroll-indicator {
      position: absolute;
      bottom: 0;
      left: 0;
      right: 0;
      height: 30px;
      background: linear-gradient(to bottom, transparent, #1e293b);
      pointer-events: none;
      opacity: 0;
      transition: opacity 0.3s;
    }
    .code-block-wrapper.has-overflow .code-scroll-indicator { opacity: 1; }
  `],
  encapsulation: ViewEncapsulation.None
})
export class MarkdownRendererComponent implements OnChanges {
  @Input() text = '';
  safeHtml: SafeHtml = '';

  private alertTypes: Record<string, AlertConfig> = {
    note: {
      icon: '<path d="M12 16v-4"/><path d="M12 8h.01"/><circle cx="12" cy="12" r="10"/>',
      borderColor: '#3b82f6', bgColor: '#eff6ff', titleColor: '#1d4ed8', label: 'Catatan'
    },
    tip: {
      icon: '<path d="M12 2a7 7 0 0 1 7 7c0 2.38-1.19 4.47-3 5.74V17a2 2 0 0 1-2 2H10a2 2 0 0 1-2-2v-2.26C6.19 13.47 5 11.38 5 9a7 7 0 0 1 7-7z"/><path d="M9 21h6"/>',
      borderColor: '#22c55e', bgColor: '#f0fdf4', titleColor: '#15803d', label: 'Tips'
    },
    important: {
      icon: '<path d="M12 7v6"/><path d="M12 17h.01"/><circle cx="12" cy="12" r="10"/>',
      borderColor: '#a855f7', bgColor: '#faf5ff', titleColor: '#7e22ce', label: 'Penting'
    },
    warning: {
      icon: '<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
      borderColor: '#f59e0b', bgColor: '#fffbeb', titleColor: '#b45309', label: 'Peringatan'
    },
    caution: {
      icon: '<circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>',
      borderColor: '#ef4444', bgColor: '#fef2f2', titleColor: '#b91c1c', label: 'Bahaya'
    }
  };

  constructor(private sanitizer: DomSanitizer, private cdr: ChangeDetectorRef, private el: ElementRef) {
    const renderer = new marked.Renderer();
    const alertTypesForClosure = this.alertTypes;

    // Headings with anchor links
    renderer.heading = function(this: any, { tokens, depth }: { tokens: Tokens.Generic[], depth: number }) {
      const getRawText = (tks: any[]): string => tks.map(t => {
        if ('text' in t && typeof t['text'] === 'string') return t['text'];
        if ('tokens' in t && Array.isArray(t['tokens'])) return getRawText(t['tokens']);
        return '';
      }).join('');
      const text = getRawText(tokens);
      const slug = text.toLowerCase().replace(/[^\w\s-]/g, '').replace(/\s+/g, '-').substring(0, 50);
      const sizes = ['', '1.75rem', '1.4rem', '1.2rem', '1.1rem', '1rem', '0.9rem'];
      return `<h${depth} id="${slug}" style="font-size:${sizes[depth]}">
        <a href="#${slug}" class="heading-anchor" aria-hidden="true">#</a>
        ${this.parser.parseInline(tokens)}
      </h${depth}>`;
    };

    // Code blocks with line numbers & filename support
    renderer.code = function(this: any, { text, lang }: { text: string, lang?: string }) {
      let language = lang || 'code';
      let filename = '';
      
      // Support ```ts:app.component.ts syntax
      if (language.includes(':')) {
        const parts = language.split(':');
        language = parts[0];
        filename = parts[1];
      }
      
      const escapedText = text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
      
      const displayName = filename || language;
      
      return `
        <div class="code-block-wrapper">
          <div class="code-header">
            <div class="code-header-left">
              <div class="code-dots"><span class="code-dot code-dot-red"></span><span class="code-dot code-dot-yellow"></span><span class="code-dot code-dot-green"></span></div>
              <span class="code-filename">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 17l6-6-6-6"/><path d="M12 19h8"/></svg>
                ${displayName}
              </span>
            </div>
            <div class="copy-button" data-code="${btoa(unescape(encodeURIComponent(text)))}">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
              <span>SALIN</span>
              <span class="copy-hint" style="opacity:0.5; font-size:9px;">CTRL+C</span>
            </div>
          </div>
          <div class="code-with-lines">
            <pre><code>${escapedText}</code></pre>
          </div>
          <div class="code-scroll-indicator"></div>
        </div>
      `;
    };

    // Blockquotes → Alerts or regular blockquotes
    renderer.blockquote = function(this: any, { tokens }: { tokens: Tokens.Generic[] }) {
      const getRawText = (tks: any[]): string => tks.map(t => {
        if ('text' in t && typeof t['text'] === 'string') return t['text'];
        if ('tokens' in t && Array.isArray(t['tokens'])) return getRawText(t['tokens']);
        return '';
      }).join('');
      const text = getRawText(tokens);
      const alertMatch = text.match(/^\[\!(\w+)\]\s*(.*)$/s);
      
      if (alertMatch) {
        const type = alertMatch[1].toLowerCase();
        const config = alertTypesForClosure[type] || alertTypesForClosure['note'];
        
        return `
          <div class="markdown-alert markdown-alert-${type}">
            <svg class="markdown-alert-icon" viewBox="0 0 24 24" fill="none" stroke="${config.titleColor}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              ${config.icon}
            </svg>
            <div class="markdown-alert-title">${config.label}</div>
            <div>${marked.parseInline(alertMatch[2])}</div>
          </div>
        `;
      }
      
      return `<blockquote>${this.parser.parse(tokens)}</blockquote>`;
    };

    // Images with wrapper and caption
    renderer.image = function(this: any, { href, title, text }: { href: string, title?: string | null, text: string }) {
      const caption = title || text || '';
      return `
        <div class="image-wrapper">
          <img src="${href}" alt="${text}" title="${title || ''}" loading="lazy" />
          ${caption ? `<div class="image-caption">${caption}</div>` : ''}
        </div>
      `;
    };

    // Horizontal rule
    renderer.hr = () => '<hr>';

    marked.setOptions({ 
      renderer,
      gfm: true,
      breaks: true
    });
  }

  @HostListener('click', ['$event'])
  onComponentClick(event: MouseEvent) {
    const target = event.target as HTMLElement;
    const copyBtn = target.closest('.copy-button') as HTMLElement;
    
    if (copyBtn) {
      const base64Code = copyBtn.getAttribute('data-code');
      if (base64Code) {
        const textToCopy = decodeURIComponent(escape(atob(base64Code)));
        navigator.clipboard.writeText(textToCopy).then(() => {
          const originalContent = copyBtn.innerHTML;
          copyBtn.innerHTML = `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
            <span>TERSALIN!</span>
          `;
          copyBtn.style.color = '#4ade80';
          setTimeout(() => {
            copyBtn.innerHTML = originalContent;
            copyBtn.style.color = '';
          }, 2000);
        });
      }
      return;
    }

    // Smooth scroll for anchor links
    const anchor = target.closest('a[href^="#"]') as HTMLAnchorElement;
    if (anchor && anchor.classList.contains('heading-anchor')) {
      event.preventDefault();
      const id = anchor.getAttribute('href')?.slice(1);
      if (id) {
        const el = document.getElementById(id);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'start' });
          history.pushState(null, '', `#${id}`);
        }
      }
    }
  }

  @HostListener('keydown', ['$event'])
  onKeydown(event: KeyboardEvent) {
    // Ctrl+C on focused code block copies content
    if (event.ctrlKey && event.key === 'c') {
      const active = document.activeElement;
      const codeBlock = active?.closest('.code-block-wrapper');
      if (codeBlock) {
        const btn = codeBlock.querySelector('.copy-button') as HTMLElement;
        if (btn) btn.click();
      }
    }
  }

  async ngOnChanges() {
    if (this.text) {
      const rawHtml = await marked.parse(this.text);
      this.safeHtml = this.sanitizer.bypassSecurityTrustHtml(rawHtml as string);
      
      // Post-process: mark first paragraph after h1 as lead
      setTimeout(() => {
        const h1 = this.el.nativeElement.querySelector('h1');
        if (h1) {
          const nextP = h1.nextElementSibling;
          if (nextP && nextP.tagName === 'P') {
            nextP.classList.add('lead');
          }
        }
      });
    } else {
      this.safeHtml = '';
    }
    this.cdr.detectChanges();
  }

  private extractText(tokens: Tokens.Generic[]): string {
    return tokens.map(t => {
      if ('text' in t && typeof t['text'] === 'string') return t['text'];
      if ('tokens' in t && Array.isArray(t['tokens'])) return this.extractText(t['tokens']);
      return '';
    }).join('');
  }

  private renderTokens(tokens: Tokens.Generic[]): string {
    return tokens.map(t => {
      if ('text' in t && typeof t['text'] === 'string') return t['text'];
      if ('raw' in t && typeof t['raw'] === 'string') return t['raw'];
      return '';
    }).join('');
  }

  private slugify(text: string): string {
    return text.toLowerCase()
      .replace(/[^\w\s-]/g, '')
      .replace(/\s+/g, '-')
      .substring(0, 50);
  }
}
