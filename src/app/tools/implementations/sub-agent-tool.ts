import type { ToolRegistryEntry, ToolExecutionContext, ToolResult } from './types';
import { GoogleGenAI, Type } from '@google/genai';
import { agentEventBus } from '../../agent/agent-event-bus';
import { generateId } from '../../utils';
import { db } from '../../core/services/db.service';
import { codeTools } from './code-tools';

// ============================================================
// SYSTEM ROLE REGISTRY & CONTRACT VALIDATION
// ============================================================
import { roleRegistry } from './agent-roles/registry';
import { RoleValidator } from './agent-roles/validator';

// ============================================================
// SUB-AGENT POOL (Reusable clients, avoid re-instantiation)
// ============================================================

interface AgentClient {
  ai: GoogleGenAI;
  lastUsed: number;
  failureCount: number;
}

class SubAgentPool {
  private clients = new Map<string, AgentClient>();

  getClient(apiKey: string): AgentClient {
    if (!this.clients.has(apiKey)) {
      this.clients.set(apiKey, {
        ai: new GoogleGenAI({ apiKey }),
        lastUsed: Date.now(),
        failureCount: 0,
      });
    }
    
    const client = this.clients.get(apiKey)!;
    client.lastUsed = Date.now();
    return client;
  }

  recordFailure(client: AgentClient): void {
    client.failureCount++;
  }

  recordSuccess(client: AgentClient): void {
    client.failureCount = Math.max(0, client.failureCount - 1);
  }
}

const agentPool = new SubAgentPool();

// ============================================================
// SHARED SUB-AGENT MEMORY (Sliding Window: 10 Items)
// ============================================================

export interface MemoryEntry {
  role: string;
  task: string;
  result: string;
  timestamp: number;
}

class SubAgentMemory {
  private memory: MemoryEntry[] = [];
  private readonly MAX_SIZE = 10;
  private isLoaded = false;

  async loadFromDb() {
    if (this.isLoaded) return;
    if (typeof window === 'undefined' || typeof window.indexedDB === 'undefined') return;
    
    try {
      const records = await db.memories.where('scope').equals('sub-agent-global').sortBy('createdAt');
      this.memory = records.map(r => JSON.parse(r.value));
      
      // Pastikan tidak melebihi MAX_SIZE saat di-load
      while (this.memory.length > this.MAX_SIZE) {
        this.memory.shift();
      }
      this.isLoaded = true;
    } catch (e) {
      console.warn("Failed to load sub-agent memory from Dexie", e);
    }
  }

  async add(entry: MemoryEntry) {
    this.memory.push(entry);
    if (this.memory.length > this.MAX_SIZE) {
      this.memory.shift();
    }
    
    // Simpan ke IndexedDB (Dexie)
    if (typeof window !== 'undefined' && typeof window.indexedDB !== 'undefined') {
      try {
        await db.memories.put({
          key: `sub-agent-memory-${entry.timestamp}-${generateId()}`,
          value: JSON.stringify(entry),
          scope: 'sub-agent-global',
          ttl: null,
          createdAt: entry.timestamp
        });
        
        // Membersihkan memori lawas dengan Bulk Delete yang jauh lebih ringan
        const count = await db.memories.where('scope').equals('sub-agent-global').count();
        if (count > this.MAX_SIZE) {
           const deleteCount = count - this.MAX_SIZE;
           // Ambil 'key'-nya saja, lalu bulkDelete
           const oldestRecords = await db.memories.where('scope').equals('sub-agent-global').sortBy('createdAt');
           const toDeleteKeys = oldestRecords.slice(0, deleteCount).map(r => r.key as string);
           
           if (toDeleteKeys.length > 0) {
             await db.memories.bulkDelete(toDeleteKeys);
           }
        }
      } catch (e) {
        console.warn("Failed to save sub-agent memory to Dexie", e);
      }
    }
  }

  getRecentContext(): string {
    if (this.memory.length === 0) return 'Belum ada riwayat memori untuk sub-agen pada sesi ini.';
    return this.memory.map((m, i) => {
      // Truncate result to prevent token bloat
      const content = m.result.length > 800 ? m.result.substring(0, 800) + '...[TRUNCATED]' : m.result;
      return `[Log ${i+1}] (Agen: ${m.role}) - Waktu: ${new Date(m.timestamp).toLocaleTimeString()}
Task: ${m.task}
Summary: ${content}`;
    }).join('\n\n');
  }
}

export const sharedSubAgentMemory = new SubAgentMemory();

// ============================================================
// SUB-AGENT TOOLS
// ============================================================

export const subAgentTools: Record<string, ToolRegistryEntry> = {
  delegate_task: {
    definition: {
      name: 'delegate_task',
      description: 'Delegasikan tugas spesifik ke Sub-Agent (Gemini Flash). Ideal untuk ekstraksi, validasi, atau pemrosesan data paralel.',
      parameters: [
        { 
          name: 'task', 
          type: 'string', 
          description: 'Deskripsi tugas yang harus diselesaikan', 
          required: true 
        },
        { 
          name: 'context', 
          type: 'string', 
          description: 'Data atau konteks tambahan', 
          required: false,
          default: ''
        },
        { 
          name: 'agentRole', 
          type: 'string', 
          description: 'Peran agent yang digunakan (misal: frontend-engineer, backend-engineer, qa-auditor, dll. Atau legacy id seperti gemma_worker_31b)', 
          required: false,
          default: 'general-assistant'
        },
        { 
          name: 'temperature', 
          type: 'number', 
          description: 'Kreativitas output (0.0-1.0)', 
          required: false,
          default: 0.3
        },
      ],
      routing: {
        priority: 3, // Lower priority — bisa lambat
        timeoutMs: 300000, // 5 menit untuk AI generation
        retryable: true,
        maxRetries: 2,
        cacheable: true, // AI responses bisa di-cache untuk task identik
        cacheTtlMs: 300000, // 5 menit
      },
    },
    executor: async (ctx: ToolExecutionContext): Promise<ToolResult> => {
      const startTime = performance.now();
      const { task, context, temperature, agentRole } = ctx.args as { 
        task: string; 
        context: string; 
        temperature: number;
        agentRole: string;
      };

      try {
        const keys = [];
        if (typeof GEMINI_API_KEY !== 'undefined' && GEMINI_API_KEY) keys.push(GEMINI_API_KEY);
        if (typeof GEMINI_API_KEY_v2 !== 'undefined' && GEMINI_API_KEY_v2) keys.push(GEMINI_API_KEY_v2);

        if (keys.length === 0) {
          return {
            status: 'error',
            output: 'GEMINI_API_KEY is not defined',
            metadata: {
              toolName: 'delegate_task',
              executionTimeMs: Math.round(performance.now() - startTime),
              attemptCount: 1,
              cached: false,
              truncated: false,
              errorType: 'validation',
              errorCode: 'NO_API_KEY',
            },
          };
        }
        
        const roleValidation = RoleValidator.validate(agentRole, []);
        const resolvedRole = roleValidation.resolvedRole;

        const targetModels = roleRegistry.getWorkerPreference(resolvedRole.id);

        const memoryStr = sharedSubAgentMemory.getRecentContext();
        const systemInstruction = roleRegistry.buildSystemInstruction(resolvedRole.id, {
          memoryStr: memoryStr,
          extraWarnings: roleValidation.warnings,
        });

        let externalSkillsStr = '';
        try {
          if (typeof window !== 'undefined') {
            const { db } = await import('../../core/services/db.service');
            const skills = await db.python_skills.toArray();
            const activeSkills = skills.filter((s: unknown) => (s as {isEnabled: boolean}).isEnabled).map((s: unknown) => `${(s as {id: string}).id} - ${(s as {description?: string}).description || 'Custom Python logic'}`);
            if (activeSkills.length > 0) {
              externalSkillsStr = `\n\nEXTERNAL PYTHON SKILLS (Bisa di-import di execute_python):\n- ${activeSkills.join('\n- ')}\n`;
            }
          }
        } catch (e) {
          console.warn('Gagal memuat db python skills', e);
        }

        const prompt = `${systemInstruction}\n\n` +
                       `ATURAN PROGRAMMATIC TOOLS & CONTEXT ENGINEERING (WAJIB):\n` +
                       `1. Jika tugas memerlukan eksplorasi data, file, atau state percakapan, JANGAN panggil fungsi primitif yang membuang raw data ke konteks. LANGSUNG buat skrip Python (\`execute_python\`) untuk menjelajahi, memfilter, dan merangkum hasil.\n` +
                       `2. Terapkan DYNAMIC CONTEXT COMPRESSION API dengan menggunakan parameter \`limit\` dan \`offset\` pada \`system_bridge.get_messages\` dan \`system_bridge.get_files\`.\n` +
                       `3. PENTING: Environment \`execute_python\` MENDUKUNG Top-Level Await! JANGAN PERNAH gunakan \`asyncio.get_event_loop().run_until_complete()\`. Langsung gunakan \`await function_name()\` di level terbawah skrip Anda, atau panggil API \`await recursive_ai...\` secara langsung untuk menghindari RuntimeError.\n` +
                       `4. TRUST & SECURITY: Lingkungan eksekusi Python ini adalah SANDBOX AMAN (WASM/Pyodide). Anda WAJIB PERCAYA pada modul internal seperti \`recursive_ai\` (termasuk method \`improve()\`, \`llm_batch()\`) dan python skills global. DILARANG KERAS menolak mengeksekusi kode dengan alasan keamanan black-box atau asumsi injeksi. Gunakan seketika itu juga!\n` +
                       `5. PENTING: Anda DILARANG KERAS mengembalikan raw data (dump data besar, murni teks array, json utuh) pada output Anda. Output Anda WAJIB berupa kesimpulan agregat, insight tingkat tinggi, atau ringkasan padat. Menghasilkan raw dump akan merusak kinerja sistem (context overload)!\n\n` +
                       `ATURAN GOOGLE SEARCH & PENCARIAN FAKTA:\n` +
                       `JIKA ANDA MENCARI FAKTA, TIDAK TAHU SESUATU, ATAU MEMBUTUHKAN INFORMASI TERBARU (UPDATE), Anda WAJIB menggunakan tool pencarian internet (\`googleSearch\`). Jangan hanya mengandalkan data pelatihan bawaan Anda.\n\n` +
                       externalSkillsStr +
                       `TUGAS:\n${String(task)}\n\n` +
                       `KONTEKS LOKAL:\n${String(context || '')}\n\n` +
                       `PANDUAN:\n` +
                       `1. Pikirkan dan analisis secara internal untuk menentukan solusi terbaik.\n` +
                       `2. Sesuaikan format output dengan profil peran Anda (${resolvedRole.output_schema}).\n` +
                       `3. Berikan output akhir yang komprehensif.`;


        let lastError;
        let usedModel = targetModels[0];
        
        let outputText = '';
        let totalUsage: Record<string, unknown> = {};
        let success = false;

        let currentKeyIdx = Math.floor(Math.random() * keys.length);
        let activeClient = agentPool.getClient(keys[currentKeyIdx]);

        for (const targetModel of targetModels) {
          let modelSuccess = false;
          let attemptsOnModel = 0;
          usedModel = targetModel;

          while (attemptsOnModel < 8 && !modelSuccess) {
            try {
              const subAgentId = `sub-agent-${Date.now()}`;
              const thinkId = `${subAgentId}-think`;

              agentEventBus.next({
                id: thinkId,
                type: 'think.start',
                timestamp: new Date().toISOString(),
                parentId: ctx.requestId,
                payload: { label: `Delegated Task (${targetModel})` },
              });

              const session = activeClient.ai.chats.create({
                model: targetModel,
                config: {
                  temperature: Math.max(0, Math.min(1, Number(temperature) || 0.3)),
                  maxOutputTokens: 8192,
                  systemInstruction: prompt,
                  tools: [
                    { googleSearch: {} },
                    { codeExecution: {} },
                    {
                      functionDeclarations: [
                        {
                          name: codeTools['execute_python'].definition.name,
                          description: codeTools['execute_python'].definition.description,
                          parameters: {
                            type: Type.OBJECT,
                            properties: {
                              code: { type: Type.STRING, description: 'Kode Python yang akan dieksekusi' },
                              cacheKey: { type: Type.STRING, description: 'Key cache opsional' }
                            },
                            required: ['code']
                          }
                        }
                      ]
                    }
                  ]
                }
              });
              
              let isDone = false;
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              let nextInput: any = { message: '' };
              let inThoughtBlock = false;
              outputText = '';

              while (!isDone) {
                const stream = await session.sendMessageStream(nextInput);
                const toolCalls: Record<string, unknown>[] = [];
                
                for await (const chunk of stream as unknown as Iterable<unknown>) {
                  let chunkText = '';
                  let thoughtText = '';

                  const c = chunk as { candidates?: { content?: { parts?: Record<string, unknown>[] } }[], text?: string, functionCalls?: Record<string, unknown>[], usageMetadata?: Record<string, unknown> };
                  const parts = c?.candidates?.[0]?.content?.parts;
                  if (parts) {
                    for (const p of parts) {
                      const isThought = p['thought'] || !!p['executableCode'] || !!p['codeExecutionResult'];
                      if (isThought) {
                        if (!inThoughtBlock) {
                          chunkText += '<think>\n';
                          inThoughtBlock = true;
                        }
                        if (typeof p['thought'] === 'string') {
                          chunkText += p['thought'];
                          thoughtText += p['thought'];
                        } else if (p['text']) {
                          chunkText += p['text'] as string;
                          thoughtText += p['text'] as string;
                        }
                        if (p['executableCode']) chunkText += `\n\`\`\`python\n${(p['executableCode'] as Record<string, unknown>)['code']}\n\`\`\`\n`;
                        if (p['codeExecutionResult']) chunkText += `\nOutput:\n\`\`\`\n${(p['codeExecutionResult'] as Record<string, unknown>)['output']}\n\`\`\`\n`;
                      } else if (p['text']) {
                        if (inThoughtBlock) {
                          chunkText += '\n</think>\n';
                          inThoughtBlock = false;
                        }
                        chunkText += p['text'] as string;
                      }
                    }
                  }
                  if (c.text && !parts) {
                    if (inThoughtBlock) {
                      chunkText += '\n</think>\n';
                      inThoughtBlock = false;
                    }
                    chunkText += c.text;
                  }

                  if (c.functionCalls?.length) {
                    toolCalls.push(...c.functionCalls);
                  }

                  if (chunkText) {
                    outputText += chunkText;
                    agentEventBus.next({
                      id: thinkId,
                      type: 'think.chunk',
                      timestamp: new Date().toISOString(),
                      parentId: ctx.requestId,
                      payload: { content: chunkText, thought: thoughtText }
                    });
                  }

                  if (c.usageMetadata) {
                    totalUsage = c.usageMetadata as Record<string, unknown>;
                  }
                } // end for await
                
                if (toolCalls.length > 0) {
                  const functionResponses = [];
                  for (const call of toolCalls) {
                    try {
                      let output = '';
                      const callName = call['name'] as string;
                      
                      // Dynamic Check: Eksekusi tool apa saja yang terdaftar di codeTools
                      if (callName in codeTools) {
                        const callCtx = { ...ctx, arguments: call['args'] as Record<string, unknown> };
                        const callResult = await codeTools[callName].executor(callCtx);
                        output = callResult.output || '';
                      } else {
                        output = `Tool '${callName}' not found or disabled.`;
                      }
                      
                      functionResponses.push({
                        functionResponse: { name: callName, response: { output } }
                      });
                    } catch (e: unknown) {
                      functionResponses.push({
                        functionResponse: { name: call['name'] as string, response: { error: (e as Error).message } }
                      });
                    }
                  }
                  nextInput = functionResponses;
                } else {
                  isDone = true;
                }
              } // end while (!isDone)
              
              if (inThoughtBlock) {
                outputText += '\n</think>\n';
              }

              agentEventBus.next({
                id: thinkId,
                type: 'think.end',
                timestamp: new Date().toISOString(),
                parentId: ctx.requestId,
                metadata: { status: 'success' },
                payload: { tokensIn: totalUsage?.['promptTokenCount'] as number, tokensOut: totalUsage?.['candidatesTokenCount'] as number }
              });

              success = true;
              modelSuccess = true;
              break; 
            } catch (error) {
              lastError = error;
              const errObj = error as { status?: string, message?: string };
              const isRateLimit = errObj?.status === 'RESOURCE_EXHAUSTED' || errObj?.message?.includes('429');
              const isUnavailable = errObj?.status === '503' || errObj?.message?.includes('503');
              const isUnknownFetchError = errObj?.status === 'UNKNOWN' || errObj?.message?.includes('status code: 0') || errObj?.message?.includes('500');
              const isInvalidKey = errObj?.message?.includes('API key not valid') || errObj?.status === 'INVALID_ARGUMENT';
              
              if (isRateLimit || isUnavailable || isUnknownFetchError || isInvalidKey) {
                attemptsOnModel++;
                const maxLogicalRetries = Math.min(8, keys.length * 2); // Hindari infinite spam jika key sedikit
                
                if (attemptsOnModel <= maxLogicalRetries) {
                   currentKeyIdx = (currentKeyIdx + 1) % keys.length;
                   activeClient = agentPool.getClient(keys[currentKeyIdx]);
                   
                   // Exponential backoff
                   const baseDelay = isRateLimit ? 3000 : 1500;
                   const delay = Math.min(baseDelay * Math.pow(1.5, attemptsOnModel - 1), 15000); // Max cap 15s
                   
                   console.warn(`Sub-Agent 429/503. Switching key... Delay ${Math.round(delay)}ms (Attempt ${attemptsOnModel}/${maxLogicalRetries})`);
                   await new Promise(resolve => setTimeout(resolve, delay));
                   continue;
                } else {
                   console.warn(`Sub-Agent exhausted all reasonable retries for model ${targetModel}.`);
                   break;
                }
              }
              break; // Jika error syntax / context length, langsung break (tidak perlu retry)
            }
          }
          if (success) break;
          // Don't fallback to next model, just break out of targetModels loop since user requested not to roll models
          break;
        }

        if (!success) {
          throw lastError || new Error('All sub-agent fallback models failed');
        }

        agentPool.recordSuccess(activeClient);

        const output = outputText || '(no output)';
        
        if (output.trim().startsWith('OUT_OF_SCOPE') || output.trim().startsWith('[OUT_OF_SCOPE')) {
            console.warn(`[Delegate Task] Agen menolak tugas karena out of scope: ${output}`);
        }

        sharedSubAgentMemory.add({
          role: agentRole,
          task: task,
          result: output,
          timestamp: Date.now()
        });


        const truncated = output.length >= 8192;

        return {
          status: 'success',
          output,
          data: {
            model: usedModel,
            usage: totalUsage,
          },
          metadata: {
            toolName: 'delegate_task',
            executionTimeMs: Math.round(performance.now() - startTime),
            attemptCount: 1,
            cached: false,
            truncated,
          },
        };


      } catch (error) {
        // Record failure untuk circuit breaker logic
        let apiKey;
        if (typeof GEMINI_API_KEY !== 'undefined' && GEMINI_API_KEY) apiKey = GEMINI_API_KEY;
        if (apiKey) {
          const client = agentPool.getClient(apiKey);
          agentPool.recordFailure(client);
        }

        const errorMessage = error instanceof Error ? error.message : String(error);
        const isTimeout = errorMessage.includes('timeout') || errorMessage.includes('deadline');
        const isRateLimit = errorMessage.includes('429') || errorMessage.includes('quota');

        return {
          status: 'error',
          output: `Sub-agent error: ${errorMessage}`,
          metadata: {
            toolName: 'delegate_task',
            executionTimeMs: Math.round(performance.now() - startTime),
            attemptCount: 1,
            cached: false,
            truncated: false,
            errorType: isTimeout ? 'timeout' : isRateLimit ? 'network' : 'runtime',
            errorCode: isTimeout ? 'TIMEOUT' : isRateLimit ? 'RATE_LIMIT' : 'AGENT_ERROR',
          },
        };
      }
    },
  }
};
