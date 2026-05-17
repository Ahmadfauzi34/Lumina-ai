import { describe, it, expect } from 'vitest';
import { subAgentTools } from './sub-agent-tool';

describe('Sub-Agent Tool', () => {
  it('KONTRAK: subAgentTools harus memiliki definisi untuk delegate_task', () => {
    expect(subAgentTools).toBeDefined();
    expect(subAgentTools['delegate_task']).toBeDefined();
    expect(subAgentTools['delegate_task'].definition.name).toBe('delegate_task');
  });
});
