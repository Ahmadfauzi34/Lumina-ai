import type { ToolCall, ToolResult } from './types';
import { registry as unifiedRegistry } from './implementations/tool-registry';
import { toolPipeline } from './implementations/tool-pipeline';
import { db } from '../core/services/db.service';
import type { ToolRegistryEntry } from './implementations/types';
import { ASCIIDiagram } from './ascii-diagram';

import { taskPipeline } from '../task-pipeline';
import { unitTestHandler } from '../task-handlers/unit-test.handler';
import { codeReviewHandler } from '../task-handlers/code-review.handler';
import { migrationHandler } from '../task-handlers/migration.handler';

// Register task handlers
taskPipeline.registerHandler(unitTestHandler);
taskPipeline.registerHandler(codeReviewHandler);
taskPipeline.registerHandler(migrationHandler);

export const systemTools: Record<string, ToolRegistryEntry> = {
  get_system_info: {
    definition: {
      name: 'get_system_info',
      description: 'Get system information: browser, OS, screen, memory.',
      parameters: [],
      routing: { priority: 1, timeoutMs: 5000, retryable: false, maxRetries: 0, cacheable: false, cacheTtlMs: 0 },
    },
    executor: async (_ctx) => {
      const info = {
        userAgent: navigator.userAgent,
        platform: navigator.platform,
        language: navigator.language,
        screen: `${screen.width}x${screen.height}`,
        memory: 'deviceMemory' in navigator ? `${(navigator as unknown as { deviceMemory: number }).deviceMemory}GB` : 'unknown',
        cores: navigator.hardwareConcurrency || 'unknown',
        online: navigator.onLine,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        timestamp: new Date().toISOString(),
      };

      // Generate ASCII visual output
      const diagram = new ASCIIDiagram({ 
        borderStyle: 'round',
        maxWidth: 80,
        colorize: false 
      });

      const tableOutput = diagram.table(
        ['Property', 'Value'],
        [
          ['Platform', info.platform],
          ['Screen', info.screen],
          ['Memory', info.memory],
          ['Cores', String(info.cores)],
          ['Online', info.online ? '✓ Yes' : '✗ No'],
          ['Language', info.language],
          ['Timezone', info.timezone],
        ],
        { 
          headerStyle: 'underline',
          zebraStripes: true 
        }
      );

      // Add summary metrics
      const metrics = diagram.metricCards([
        { label: 'CPU Cores', value: String(info.cores), unit: ' cores', trend: 'neutral' },
        { label: 'Memory', value: info.memory.replace('GB', ''), unit: 'GB', trend: 'neutral' },
      ]);

      const finalOutput = tableOutput + '\n\n' + metrics;

      return {
        status: 'success' as const,
        output: finalOutput,
        metadata: {
          toolName: 'get_system_info',
          executionTimeMs: 0,
          attemptCount: 1,
          cached: false,
          truncated: false,
          ...info
        }
      };
    },
  },
  get_current_time: {
    definition: {
      name: 'get_current_time',
      description: 'Get current date and time.',
      parameters: [
        { name: 'timezone', type: 'string', description: 'Timezone (e.g. Asia/Jakarta)', required: false },
        { name: 'format', type: 'string', description: 'Format: iso, locale, or custom', required: false }, // enum check removed for simplicity
      ],
      routing: { priority: 1, timeoutMs: 5000, retryable: false, maxRetries: 0, cacheable: false, cacheTtlMs: 0 },
    },
    executor: async (ctx) => {
      const args = ctx.args;
      const now = new Date();
      const tz = String(args?.['timezone'] || 'Asia/Jakarta');
      let output: string;
      switch (args?.['format']) {
        case 'iso': output = now.toISOString(); break;
        case 'custom': output = now.toLocaleString('id-ID', { timeZone: tz, dateStyle: 'full', timeStyle: 'long' }); break;
        default: output = now.toLocaleString('id-ID', { timeZone: tz });
      }
      return { 
        status: 'success', 
        output, 
        metadata: { 
          toolName: 'get_current_time',
          executionTimeMs: 0,
          attemptCount: 1,
          cached: false,
          truncated: false 
        } 
      };
    },
  },
};

export const memoryTools: Record<string, ToolRegistryEntry> = {
  memory_read: {
    definition: {
      name: 'memory_read',
      description: 'Read dari memory/context storage. Gunakan untuk mengingat fakta, preference user, atau state project.',
      parameters: [
        { name: 'key', type: 'string', description: 'Memory key', required: true },
        { name: 'scope', type: 'string', description: 'Scope: session, project, global', required: false },
      ],
      routing: { priority: 1, timeoutMs: 5000, retryable: false, maxRetries: 0, cacheable: false, cacheTtlMs: 0 },
    },
    executor: async (ctx) => {
      const args = ctx.args;
      try {
        const key = String(args?.['key']);
        const scope = String(args?.['scope'] || 'session');
        const fullKey = `memory:${scope}:${key}`;
        const memoryRecord = await db.memories.get(fullKey);
        return {
          status: 'success',
          output: memoryRecord?.value || `(no memory found for key: ${key})`,
          metadata: { toolName: 'memory_read', executionTimeMs: 0, attemptCount: 1, cached: false, truncated: false },
        };
      } catch (error) {
        return { 
          status: 'error', 
          output: `Memory read error: ${error instanceof Error ? error.message : 'Unknown'}`,
          metadata: { toolName: 'memory_read', executionTimeMs: 0, attemptCount: 1, cached: false, truncated: false }
        };
      }
    },
  },
  memory_write: {
    definition: {
      name: 'memory_write',
      description: 'Write ke memory/context storage. Gunakan untuk menyimpan fakta, preference, atau learnings.',
      parameters: [
        { name: 'key', type: 'string', description: 'Memory key', required: true },
        { name: 'value', type: 'string', description: 'Value yang akan disimpan', required: true },
        { name: 'scope', type: 'string', description: 'Scope: session, project, global', required: false },
        { name: 'ttl', type: 'number', description: 'Time-to-live dalam jam (0 = forever)', required: false },
      ],
      routing: { priority: 1, timeoutMs: 5000, retryable: false, maxRetries: 0, cacheable: false, cacheTtlMs: 0 },
    },
    executor: async (ctx) => {
      const args = ctx.args;
      try {
        const key = String(args?.['key']);
        const value = String(args?.['value']);
        const scope = String(args?.['scope'] || 'session');
        const ttl = Number(args?.['ttl']) || 0;
        const fullKey = `memory:${scope}:${key}`;
        await db.memories.put({ key: fullKey, value, scope, ttl: ttl > 0 ? ttl * 3600000 : null, createdAt: Date.now() });
        return { 
          status: 'success', 
          output: `Memory saved: ${key}`, 
          metadata: { toolName: 'memory_write', executionTimeMs: 0, attemptCount: 1, cached: false, truncated: false } 
        };
      } catch (error) {
        return { 
          status: 'error', 
          output: `Memory write error: ${error instanceof Error ? error.message : 'Unknown'}`,
          metadata: { toolName: 'memory_write', executionTimeMs: 0, attemptCount: 1, cached: false, truncated: false }
        };
      }
    },
  },
  memory_list: {
    definition: {
      name: 'memory_list',
      description: 'List semua memory keys dalam scope tertentu.',
      parameters: [
        { name: 'scope', type: 'string', description: 'Scope filter', required: false },
        { name: 'pattern', type: 'string', description: 'Key pattern filter', required: false },
      ],
      routing: { priority: 1, timeoutMs: 5000, retryable: false, maxRetries: 0, cacheable: false, cacheTtlMs: 0 },
    },
    executor: async (ctx) => {
      const args = ctx.args;
      try {
        const scope = String(args?.['scope'] || '');
        const pattern = String(args?.['pattern'] || '');
        const prefix = scope ? `memory:${scope}:` : 'memory:';
        const memoriesArray = await db.memories.toArray();
        const keys: string[] = [];
        memoriesArray.forEach(mem => {
          if (mem.key.startsWith(prefix)) {
            const memoryKey = mem.key.replace(prefix, '');
            if (!pattern || memoryKey.includes(pattern)) keys.push(memoryKey);
          }
        });
        return { 
          status: 'success', 
          output: keys.length > 0 ? keys.join('\n') : '(no memories found)', 
          metadata: { toolName: 'memory_list', executionTimeMs: 0, attemptCount: 1, cached: false, truncated: false } 
        };
      } catch (error) {
        return { 
          status: 'error', 
          output: `Memory list error: ${error instanceof Error ? error.message : 'Unknown'}`,
          metadata: { toolName: 'memory_list', executionTimeMs: 0, attemptCount: 1, cached: false, truncated: false }
        };
      }
    },
  },
};

export const taskTools: Record<string, ToolRegistryEntry> = {
  start_task: {
    definition: {
      name: 'start_task',
      description: 'Mulai long-running task dengan tipe tertentu. AI akan memilih tipe yang sesuai berdasarkan konteks user. Contoh: generate_unit_tests untuk membuat test, code_review untuk review code, migration untuk migrasi codebase.',
      parameters: [
        { 
          name: 'type', 
          type: 'string', 
          description: 'Tipe task. Available: ' + taskPipeline.getAvailableTasks().map(t => t.id).join(', '),
          required: true,
          enum: taskPipeline.getAvailableTasks().map(t => t.id),
        },
        { 
          name: 'args', 
          type: 'object', 
          description: 'Arguments spesifik untuk task type. Format:\n' + taskPipeline.getAvailableTasks().map(t => `- ${t.id}: { ${t.parameters.map(p => `${p.name}: ${p.type}${p.required?' (required)':''}`).join(', ')} }`).join('\n'), 
          required: true 
        },
        { name: 'auto_confirm', type: 'boolean', description: 'Skip awaiting_input phase jika true', required: false, default: false },
      ],
      routing: { priority: 1, timeoutMs: 300000, retryable: false, maxRetries: 0, cacheable: false, cacheTtlMs: 0 },
    },
    executor: async (ctx) => {
      const args = ctx.args || {};
      const typeId = String(args['type']);
      const taskArgs = args['args'] as Record<string, unknown>;
      const autoConfirm = Boolean(args['auto_confirm']);
      
      try {
        const result = await taskPipeline.startTask(typeId, {
          ...taskArgs,
          _autoConfirm: autoConfirm,
        });
        
        // Format output dengan ASCII diagram
        const diagram = new ASCIIDiagram({ borderStyle: 'round' });
        
        const artifactTable = result.artifacts.length > 0 
          ? diagram.table(
              ['File', 'Type', 'Size'],
              result.artifacts.map(a => [a.name, a.type, `${a.size || 0}B`])
            )
          : '(no artifacts)';
        
        const summary = diagram.metricCards([
          { label: 'Duration', value: `${result.metrics.elapsedMs}ms`, unit: '', trend: 'neutral' },
          { label: 'Phases', value: String(result.metrics.phaseTransitions), unit: '', trend: 'neutral' },
          { label: 'Artifacts', value: String(result.artifacts.length), unit: '', trend: 'neutral' },
        ]);
        
        return {
          status: result.status === 'success' ? 'success' : 'error',
          output: `${result.output}\n\n${summary}\n\n${artifactTable}`,
          metadata: {
            toolName: 'start_task', executionTimeMs: result.metrics.elapsedMs, attemptCount: 1, cached: false, truncated: false
          }
        };
      } catch (error) {
        return {
          status: 'error',
          output: `Task failed: ${error instanceof Error ? error.message : String(error)}`,
          metadata: { toolName: 'start_task', executionTimeMs: 0, attemptCount: 1, cached: false, truncated: false }
        };
      }
    },
  },
  
  manage_task: {
    definition: {
      name: 'manage_task',
      description: 'Kelola task yang sedang berjalan: cancel, pause, resume, atau lihat status.',
      parameters: [
        { name: 'action', type: 'string', description: 'Action: cancel, status, list', required: true, enum: ['cancel', 'status', 'list'] },
        { name: 'task_id', type: 'string', description: 'Task ID', required: false },
      ],
      routing: { priority: 1, timeoutMs: 5000, retryable: false, maxRetries: 0, cacheable: false, cacheTtlMs: 0 },
    },
    executor: async (ctx) => {
      const args = ctx.args || {};
      const action = String(args['action']);
      
      if (action === 'list') {
        const tasks = taskPipeline.getAvailableTasks();
        return {
          status: 'success',
          output: tasks.map(t => `• ${t.id}: ${t.description}`).join('\n'),
          metadata: { toolName: 'manage_task', executionTimeMs: 0, attemptCount: 1, cached: false, truncated: false },
        };
      }
      
      if (action === 'cancel' && args['task_id']) {
        const cancelled = taskPipeline.cancelTask(String(args['task_id']));
        return {
          status: 'success',
          output: cancelled ? 'Task cancelled.' : 'Task not found or already completed.',
          metadata: { toolName: 'manage_task', executionTimeMs: 0, attemptCount: 1, cached: false, truncated: false },
        };
      }
      
      return { status: 'error', output: 'Invalid action', metadata: { toolName: 'manage_task', executionTimeMs: 0, attemptCount: 1, cached: false, truncated: false } };
    },
  },
};

export const pythonSkillsTools: Record<string, ToolRegistryEntry> = {
  save_python_skill: {
    definition: {
      name: 'save_python_skill',
      description: 'Simpan atau update external Python skill (.py) yang bisa digunakan di execute_python. Skill ini disimpan secara persistent di IndexedDB.',
      parameters: [
        { name: 'id', type: 'string', description: 'ID unik skill / nama file (misal: my_skill.py)', required: true },
        { name: 'name', type: 'string', description: 'Nama deskriptif (misal: My Tools)', required: true },
        { name: 'code', type: 'string', description: 'Kode Python (functions, classes)', required: true },
        { name: 'description', type: 'string', description: 'Penjelasan penggunaan skill ini', required: false },
      ],
      routing: { priority: 1, timeoutMs: 5000, retryable: false, maxRetries: 0, cacheable: false, cacheTtlMs: 0 },
    },
    executor: async (ctx) => {
      const args = ctx.args;
      try {
        const id = String(args?.['id']);
        const name = String(args?.['name']);
        const code = String(args?.['code']);
        const description = String(args?.['description'] || '');
        
        await db.python_skills.put({ 
          id, 
          name, 
          code, 
          description, 
          isEnabled: true, 
          updatedAt: Date.now() 
        });
        
        return { 
          status: 'success', 
          output: `Python skill saved: ${id}. Perhatian: Setelah disave, memori Pyodide mungkin belum memperbaruinya (karena file python sudah diload di session ini). Jika ingin memuat ulang segera, refresh tab/page.`, 
          metadata: { toolName: 'save_python_skill', executionTimeMs: 0, attemptCount: 1, cached: false, truncated: false } 
        };
      } catch (error) {
        return { 
          status: 'error', 
          output: `Error saving skill: ${error instanceof Error ? error.message : 'Unknown'}`,
          metadata: { toolName: 'save_python_skill', executionTimeMs: 0, attemptCount: 1, cached: false, truncated: false }
        };
      }
    },
  },
  list_python_skills: {
    definition: {
      name: 'list_python_skills',
      description: 'Lihat daftar semua Python skill yang tersimpan di IndexedDB.',
      parameters: [],
      routing: { priority: 1, timeoutMs: 5000, retryable: false, maxRetries: 0, cacheable: false, cacheTtlMs: 0 },
    },
    executor: async () => {
      try {
        const skills = await db.python_skills.toArray();
        if (skills.length === 0) {
           return { status: 'success', output: '(tidak ada skill tersimpan)', metadata: { toolName: 'list_python_skills', executionTimeMs: 0, attemptCount: 1, cached: false, truncated: false }};
        }
        const str = skills.map(s => `- ${s.id} (Enabled: ${s.isEnabled}):\n  ${s.description}\n\n  \`\`\`python\n  ${s.code.substring(0, 50)}...\n  \`\`\``).join('\n');
        return { status: 'success', output: str, metadata: { toolName: 'list_python_skills', executionTimeMs: 0, attemptCount: 1, cached: false, truncated: false }};
      } catch (e) {
        return { status: 'error', output: `Error: ${e instanceof Error ? e.message : 'Unknown'}`, metadata: { toolName: 'list_python_skills', executionTimeMs: 0, attemptCount: 1, cached: false, truncated: false }};
      }
    }
  }
};

// Register system and memory tools to the unified registry
unifiedRegistry.registerBulk(systemTools);
unifiedRegistry.registerBulk(memoryTools);
unifiedRegistry.registerBulk(taskTools);
unifiedRegistry.registerBulk(pythonSkillsTools);


class AppToolRegistry {
  getDefinition(name: string): any | undefined {
    return unifiedRegistry.get(name)?.definition;
  }

  getAllDefinitions(): any[] {
    return unifiedRegistry.snapshot().definitions;
  }

  async execute(call: ToolCall): Promise<ToolResult> {
    const startTime = performance.now();
    try {
      const result = await unifiedRegistry.execute(call.name, call.arguments, call.id);
      return {
        ...result,
        toolCallId: call.id,
        durationMs: Math.round(performance.now() - startTime),
      } as ToolResult;
    } catch (error) {
      return {
        toolCallId: call.id,
        status: 'error',
        output: error instanceof Error ? error.message : 'Unknown tool execution error',
        durationMs: Math.round(performance.now() - startTime),
      };
    }
  }

  cancel(callId: string): boolean {
    return toolPipeline.cancel(callId);
  }

  toGeminiFunctions() {
    return this.getAllDefinitions().map(def => ({
      name: def.name,
      description: def.description,
      parameters: {
        type: 'OBJECT' as any,
        properties: Object.fromEntries(
          def.parameters.map((p: any) => [p.name, {
            type: typeof p.type === 'string' ? p.type.toUpperCase() as any : p.type,
            description: p.description,
            ...(p.enum ? { enum: p.enum } : {}),
            ...(p.type === 'array' || p.type === 'ARRAY' ? { 
              items: p.items ? { 
                type: typeof p.items.type === 'string' ? p.items.type.toUpperCase() as any : p.items.type,
                ...(p.items.properties ? {
                   properties: Object.fromEntries(
                    Object.entries(p.items.properties).map(([k, v]: [string, any]) => [k, { type: v.type.toUpperCase() }])
                   )
                } : {})
              } : { type: 'STRING' } 
            } : {}),
          }])
        ),
        required: def.parameters.filter((p: any) => p.required !== false).map((p: any) => p.name),
      },
    }));
  }
}

export const toolRegistry = new AppToolRegistry();
