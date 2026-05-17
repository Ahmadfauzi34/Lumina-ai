import { TestBed } from '@angular/core/testing';
import { BrowserDynamicTestingModule, platformBrowserDynamicTesting } from '@angular/platform-browser-dynamic/testing';
import { describe, it, expect, beforeEach, beforeAll } from 'vitest';
import { AgentStreamOrchestrator } from './agent-stream-orchestrator';
import { agentEventBus } from './agent/agent-event-bus';

let isEnvironmentSetup = false;

describe('AgentStreamOrchestrator (V2 Event Sourcing)', () => {
  let orchestrator: AgentStreamOrchestrator;

  beforeAll(() => {
    if (!isEnvironmentSetup) {
      isEnvironmentSetup = true;
      try {
        TestBed.initTestEnvironment(BrowserDynamicTestingModule, platformBrowserDynamicTesting());
      } catch (e) {
        // Ignored if already initialized
      }
    }
  });

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [AgentStreamOrchestrator] });
    orchestrator = TestBed.inject(AgentStreamOrchestrator);
  });

  it('KONTRAK UI: Harus otomatis mendaftarkan profil Agent ke array "agents" saat ada agentId baru', () => {
    orchestrator.initSession('main-agent', 'Lumina ✨');

    // 1. Simulasikan Main Agent mulai berpikir
    agentEventBus.next({
      id: 'step-1',
      type: 'think.start',
      timestamp: new Date().toISOString(),
      payload: { label: 'Merumuskan rencana' },
      metadata: { agentId: 'main-agent' }
    });

    const session = orchestrator.thinkSession();
    
    // VALIDASI KRUSIAL: Array agents tidak boleh kosong! (Jika kosong, Swimlane UI akan hilang)
    expect(session?.agents).toBeDefined();
    expect(session!.agents.length).toBeGreaterThan(0);
    expect(session!.agents[0].id).toBe('main-agent');
    expect(session!.steps[0].status).toBe('running');
  });

  it('KONTRAK DATA: Harus mengumpulkan chunk string ke dalam description step', () => {
    orchestrator.initSession('main-agent', 'Lumina ✨');
    
    agentEventBus.next({
      id: 'step-1',
      type: 'think.start',
      timestamp: new Date().toISOString(),
      payload: { label: 'Merumuskan rencana' },
      metadata: { agentId: 'main-agent' }
    });

    // Simulasikan streaming CoT
    agentEventBus.next({
      id: 'step-1',
      type: 'think.chunk',
      timestamp: new Date().toISOString(),
      payload: { description: 'Saya berpikir' },
      metadata: { agentId: 'main-agent' }
    });

    const session = orchestrator.thinkSession();
    expect(session!.steps[0].description).toBe('Saya berpikir');
  });
});
