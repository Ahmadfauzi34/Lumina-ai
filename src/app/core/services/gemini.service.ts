import { Injectable } from '@angular/core';
import { GoogleGenAI } from '@google/genai';
import type { Attachment } from '../../types';

export interface GeminiConfig {
  model?: string;
  fallbackModels?: string[];
  systemInstruction?: string;
  tools?: any[];
  toolConfig?: any;
}

const DEFAULT_CONFIG: Required<GeminiConfig> = {
  model: 'gemma-4-31b-it', // Contoh model utama yang dipilih di UI
  fallbackModels: ['gemini-3.1-pro-preview', 'gemini-3-flash-preview'],
  
  systemInstruction: '', // Akan di-load secara dinamis
  
  tools: [], // Nanti diisi dari toolRegistry
  toolConfig: undefined
};

@Injectable({ providedIn: 'root' })
export class GeminiService {
  private ai: any;

  private getAi() {
    if (!this.ai) {
      const keys = [];
      if (typeof GEMINI_API_KEY !== 'undefined' && GEMINI_API_KEY) keys.push(GEMINI_API_KEY);
      if (typeof GEMINI_API_KEY_v2 !== 'undefined' && GEMINI_API_KEY_v2) keys.push(GEMINI_API_KEY_v2);

      if (keys.length === 0) {
        throw new Error('GEMINI_API_KEY is not defined');
      }
      
      // Pilih key secara random untuk load balancing awal
      const selectedKey = keys[Math.floor(Math.random() * keys.length)];
      this.ai = new GoogleGenAI({ apiKey: selectedKey });
    }
    return this.ai;
  }

  async loadSystemInstruction(): Promise<void> {
    try {
      if (typeof window === 'undefined') {
        return;
      }
      const res = await fetch('/prompts/orchestrator.md');
      if (res.ok) {
        DEFAULT_CONFIG.systemInstruction = await res.text();
        
        try {
          const { db } = await import('./db.service');
          const skills = await db.python_skills.toArray();
          const activeSkills = skills.filter((s: unknown) => (s as {isEnabled: boolean}).isEnabled).map((s: unknown) => {
            const skill = s as { code?: string, id: string, description?: string };
            const code = skill.code || '';
            const exports: string[] = [];
            
            // Extract python functions
            const fnRegex = /def\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/g;
            let match;
            while ((match = fnRegex.exec(code)) !== null) {
               if (!match[1].startsWith('_')) exports.push(`${match[1]}()`);
            }
            
            // Extract python classes
            const classRegex = /class\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*[:\(]/g;
            while ((match = classRegex.exec(code)) !== null) {
               if (!match[1].startsWith('_')) exports.push(`class ${match[1]}`);
            }

            const exportsText = exports.length > 0 ? `\n  Exports: [${exports.join(', ')}]` : '';
            return `${skill.id} - ${skill.description || 'Custom Python logic'}${exportsText}`;
          });
          if (activeSkills.length > 0) {
            DEFAULT_CONFIG.systemInstruction += `\n\nEXTERNAL PYTHON SKILLS (Bisa di-import di execute_python):\n- ${activeSkills.join('\n- ')}`;
          }
        } catch (e) {
          console.warn('Gagal memuat db python skills', e);
        }
      } else {
        console.warn('Gagal memuat orchestrator.md', res.statusText);
      }
    } catch (e) {
      console.warn('Gagal memuat orchestrator.md', e);
    }
  }

  createChatSession(config: GeminiConfig = {}, history: any[] = []) {
    const ai = this.getAi();
    const finalConfig = { ...DEFAULT_CONFIG, ...config };
    const timeString = new Date().toLocaleString('id-ID', { 
      weekday: 'long', year: 'numeric', month: 'long', 
      day: 'numeric', hour: '2-digit', minute: '2-digit', timeZoneName: 'short' 
    });

    const createChatConfig: any = {
      systemInstruction: `${finalConfig.systemInstruction}\n\nInformasi Sistem:\n- Waktu lokal pengguna saat ini adalah: ${timeString}\n- Gunakan informasi waktu ini jika pengguna menanyakan waktu atau tanggal.`,
      tools: finalConfig.tools.length > 0 ? finalConfig.tools : undefined,
      toolConfig: finalConfig.toolConfig,
    };

    const modelsToTry = [
      finalConfig.model,
      ...finalConfig.fallbackModels,
    ].filter(Boolean) as string[];
    let currentModelIdx = 0;
    
    // Siapkan daftar key untuk rotasi
    const availableKeys: string[] = [];
    if (typeof GEMINI_API_KEY !== 'undefined' && GEMINI_API_KEY) availableKeys.push(GEMINI_API_KEY);
    if (typeof GEMINI_API_KEY_v2 !== 'undefined' && GEMINI_API_KEY_v2) availableKeys.push(GEMINI_API_KEY_v2);
    let currentKeyIdx = 0; // index start offset, kita bisa random
    if (availableKeys.length > 0) {
      currentKeyIdx = Math.floor(Math.random() * availableKeys.length);
    }

    const buildConfigForModel = (modelName: string, disableSearch = false) => {
      const cfg = { ...createChatConfig };
      if (modelName.startsWith('gemini-3')) {
        cfg.thinkingConfig = { thinkingBudget: 1024 };
      } else {
        delete cfg.thinkingConfig;
      }
      if (disableSearch && cfg.tools) {
         cfg.tools = cfg.tools.filter((t: { googleSearch?: unknown }) => !('googleSearch' in t));
         if (cfg.tools.length === 0) delete cfg.tools;
      }
      return cfg;
    };

    // Buat chat session dengan AI client yg fresh, karena kita ingin bisa rotate api key
    let activeAiClient = availableKeys.length > 0 ? new GoogleGenAI({ apiKey: availableKeys[currentKeyIdx] }) : ai;
    let isSearchDisabled = false;
    let chatSession = activeAiClient.chats.create({
      model: modelsToTry[currentModelIdx],
      config: buildConfigForModel(modelsToTry[currentModelIdx], isSearchDisabled),
      history: [...history],
    });

    return {
      sendMessageStream: async (opts: { message: unknown }) => {
        const attemptCall = async (retryCount = 0): Promise<any> => {
          try {
            return await chatSession.sendMessageStream(opts);
          } catch (error: unknown) {
            const err = error as { status?: string, message?: string };
            console.error(`Gemini API Error with model ${modelsToTry[currentModelIdx]}:`, error);
            
            const isExhausted = err?.status === 'RESOURCE_EXHAUSTED' || err?.message?.includes('429') || err?.message?.includes('quota');
            const isUnavailable = err?.status === '503' || err?.message?.includes('503');
            const isUnknownFetchError = err?.status === 'UNKNOWN' || err?.message?.includes('status code: 0') || err?.message?.includes('500');
            const isInvalidKey = err?.message?.includes('API key not valid') || err?.status === 'INVALID_ARGUMENT';
            const isSearchLimit = isExhausted && err?.message?.includes('search_grounding');
            const shouldRetry = isExhausted || isUnavailable || isUnknownFetchError || isInvalidKey;

            if (shouldRetry) {
              let switched = false;
              let recoveredHistory = [...history];
              try {
                  if (typeof chatSession.getHistory === 'function') {
                      recoveredHistory = await chatSession.getHistory();
                  }
              } catch {
                  // Fall back
              }

              if (isSearchLimit && !isSearchDisabled) {
                 console.warn(`Search quota reached. Disabling Google Search and retrying...`);
                 isSearchDisabled = true;
                 chatSession = activeAiClient.chats.create({
                    model: modelsToTry[currentModelIdx],
                    config: buildConfigForModel(modelsToTry[currentModelIdx], isSearchDisabled),
                    history: recoveredHistory,
                 });
                 switched = true;
              } else if (retryCount < (availableKeys.length > 1 ? availableKeys.length : 2)) {
                  if (availableKeys.length > 1) {
                      currentKeyIdx = (currentKeyIdx + 1) % availableKeys.length;
                  } else if (currentModelIdx < modelsToTry.length - 1 && retryCount >= 1) {
                      currentModelIdx++;
                  }
                  
                  console.warn(`API Limit/Unavailable reached, pindah konfigurasi... (Attempt ${retryCount + 1})`);
                  
                  activeAiClient = availableKeys.length > 0 ? new GoogleGenAI({ apiKey: availableKeys[currentKeyIdx] }) : activeAiClient;
                  chatSession = activeAiClient.chats.create({
                    model: modelsToTry[currentModelIdx],
                    config: buildConfigForModel(modelsToTry[currentModelIdx], isSearchDisabled),
                    history: recoveredHistory,
                  });
                  switched = true;
              }

              if (switched) {
                const delayMs = isExhausted && !isSearchLimit ? 3000 : 1500;
                await new Promise(resolve => setTimeout(resolve, delayMs));
                return attemptCall(retryCount + 1);
              }
            }
            throw error;
          }
        };

        return attemptCall();
      }
    };
  }

  buildMessageParts(text: string, attachments: Attachment[]): any[] {
    const parts: any[] = [];
    for (const att of attachments) {
      if (att.isText) {
        parts.push(`File: ${att.name}\n\n${att.data}`);
      } else {
        parts.push({ inlineData: { data: att.data, mimeType: att.mimeType } });
      }
    }
    if (text) {
      parts.push(text);
    }
    return parts;
  }
}
