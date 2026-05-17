import { TestBed } from '@angular/core/testing';
import { BrowserDynamicTestingModule, platformBrowserDynamicTesting } from '@angular/platform-browser-dynamic/testing';
import { describe, it, expect, beforeEach, beforeAll } from 'vitest';
import { App } from './app';
import { ChatMessageComponent } from './components/chat-message.component';

beforeAll(() => {
  try {
    TestBed.initTestEnvironment(
      BrowserDynamicTestingModule,
      platformBrowserDynamicTesting()
    );
  } catch(e) {}
});

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App, ChatMessageComponent]
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  it('Kontrak: buildChatHistory harus MENCEGAH pesan ganda dengan mengecualikan pesan user/model saat ini', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    
    // Polyfill for testing buildChatHistory
    app.gemini = { buildMessageParts: (text: string) => [{text}] } as any;

    const dbMessages = [
      { id: '1', role: 'user', text: 'Halo sebelumnya' },
      { id: '2', role: 'model', text: 'Hai sebelumnya' },
      { id: 'curr-user', role: 'user', text: 'Halo pesan sekarang' },
      { id: 'curr-model', role: 'model', text: '' }
    ];

    const history = app.buildChatHistory(dbMessages, 'curr-user', 'curr-model');
    
    expect(history.length).toBe(2);
    expect(history[0].parts[0].text).toBe('Halo sebelumnya');
    expect(history[1].parts[0].text).toBe('Hai sebelumnya');
  });

  it('Kontrak: buildChatHistory harus MEMASUKKAN thinkSession ke dalam textContent sebagai <agent_past_logs>', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    app.gemini = { buildMessageParts: (text: string) => [{text}] } as any;

    const dbMessages = [
      { 
        id: '1', role: 'model', text: 'Halo bro', 
        thinkSession: { steps: [{ label: 'Analisis', description: 'Cek data' }] } 
      }
    ];

    const history = app.buildChatHistory(dbMessages, 'curr', 'curr');
    
    expect(history.length).toBe(1);
    const textOutput = history[0].parts[0].text;
    expect(textOutput).toContain('<agent_past_logs>');
    expect(textOutput).toContain('- [Analisis] Cek data');
    expect(textOutput).toContain('Halo bro');
  });
});
