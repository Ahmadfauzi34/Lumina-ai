import type { ToolRegistryEntry } from './types';
import { codeTools } from './code-tools';
import { fileTools } from './file-tools';
import { subAgentTools } from './sub-agent-tool';
import { serverTools } from './server-tools';
import { toolPipeline } from './tool-pipeline';

// ============================================================
// UNIFIED REGISTRY (Structure of Arrays pattern)
// ============================================================

export interface RegistrySnapshot {
  names: string[];
  definitions: ToolRegistryEntry['definition'][];
  executors: ToolRegistryEntry['executor'][];
  routing: ToolRegistryEntry['definition']['routing'][];
}

class ToolRegistry {
  private tools = new Map<string, ToolRegistryEntry>();

  constructor() {
    this.registerBulk({
      ...codeTools,
      ...fileTools,
      ...subAgentTools,
      ...serverTools,
    });
  }

  register(name: string, tool: ToolRegistryEntry): void {
    this.tools.set(name, tool);
  }

  registerBulk(tools: Record<string, ToolRegistryEntry>): void {
    Object.entries(tools).forEach(([name, tool]) => this.register(name, tool));
  }

  get(name: string): ToolRegistryEntry | undefined {
    return this.tools.get(name);
  }

  has(name: string): boolean {
    return this.tools.has(name);
  }

  list(): string[] {
    return Array.from(this.tools.keys());
  }

  // SOA: Export untuk SIMD-style processing
  snapshot(): RegistrySnapshot {
    const entries = Array.from(this.tools.entries());
    return {
      names: entries.map(([name]) => name),
      definitions: entries.map(([, tool]) => tool.definition),
      executors: entries.map(([, tool]) => tool.executor),
      routing: entries.map(([, tool]) => tool.definition.routing),
    };
  }

  // Execute via pipeline
  async execute(
    name: string, 
    args: Record<string, unknown>,
    requestId?: string
  ): Promise<ReturnType<typeof toolPipeline.execute>> {
    const tool = this.get(name);
    if (!tool) {
      throw new Error(`Tool not found: ${name}`);
    }
    
    return toolPipeline.execute(
      name, 
      tool, 
      args, 
      requestId || `req-${Date.now()}-${Math.random().toString(36).slice(2)}`
    );
  }

  // Batch execute (parallel dengan shared nothing)
  async executeBatch(
    requests: { name: string; args: Record<string, unknown> }[]
  ): Promise<{ name: string; result: Awaited<ReturnType<typeof toolPipeline.execute>> }[]> {
    const results = await Promise.all(
      requests.map(async ({ name, args }) => ({
        name,
        result: await this.execute(name, args),
      }))
    );
    return results;
  }
}

// Singleton
export const registry = new ToolRegistry();
