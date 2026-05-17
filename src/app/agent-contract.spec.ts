import { parse } from 'yaml';
import { describe, it, expect } from 'vitest';

describe('Agent Batch Dispatch - YAML Contract', () => {
  const mockAgentOutput = `
    <think>Saya akan membagi ini menjadi 3 bagian.</think>
    call: batch_dispatch({
      dag_yaml: "
        tasks:
          - name: t1
            role: Coder
            model_type: reasoning
            prompt: buat fungsi x
          - name: t2
            role: Reviewer
            model_type: fast
            prompt: cek fungsi x
      "
    })
  `;

  it('harus menghasilkan YAML yang bisa di-parse dan valid', () => {
    // Simulasi ekstraksi argumen dari tool call
    const yamlMatch = mockAgentOutput.match(/dag_yaml:\s*"([\s\S]*?)"/);
    const yamlStr = yamlMatch![1].replace(/\\n/g, '\n').trim();
    
    const dag = parse(yamlStr);
    const tasks = dag.tasks || dag;

    // VALIDASI KONTRAK:
    expect(Array.isArray(tasks)).toBe(true);
    expect(tasks.length).toBeLessThanOrEqual(3); // Maksimal 3 sub-agen sesuai rencana Anda
    expect(tasks[0]).toHaveProperty('model_type');
    expect(['fast', 'reasoning']).toContain(tasks[0].model_type);
  });
});
