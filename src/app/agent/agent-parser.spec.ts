import { describe, it, expect } from 'vitest';
import { AgentParser } from './agent-parser';
import { AgentState } from './agent-state';

describe('AgentParser - CoT Validation', () => {
  it('harus mengekstraksi konten <think> yang belum tertutup (Streaming)', () => {
    const state = new AgentState();
    const parser = new AgentParser(state);
    
    const rawStream = 'Halo! <think>Saya sedang merencanakan tugas';
    parser.syncReasoningStep(rawStream, -1);
    
    // Pastikan langkah "Berpikir" dibuat di state
    expect(state.stepCount).toBe(1);
    expect(state.field.steps.descriptions[0]).toBe('Saya sedang merencanakan tugas');
    expect(state.field.steps.statuses[0]).toBe(1); // RUNNING
  });

  it('harus membersihkan tag <think> dari teks akhir UI', () => {
    const rawText = 'Jawaban: 42 <think>Mikir keras...</think>';
    const cleanText = rawText.replace(/<think>[\s\S]*?(?:<\/think>|$)/gi, '').trim();
    
    expect(cleanText).toBe('Jawaban: 42');
  });
});
