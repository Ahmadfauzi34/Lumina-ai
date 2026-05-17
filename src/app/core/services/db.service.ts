import Dexie, { type EntityTable } from 'dexie';
import { Injectable } from '@angular/core';

export interface ChatSessionDB {
  id: string;
  title: string;
  createdAt: Date;
  updatedAt: Date;
  model: string;
}

export interface ChatMessageDB {
  id: string;
  sessionId: string;
  role: 'user' | 'model';
  text: string;
  attachments?: string; // JSON string of Attachment[]
  isStreaming?: boolean;
  thinkSession?: string;
  createdAt: Date;
}

export interface VFSFile {
  path: string;
  content: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface AgentMemory {
  key: string;
  value: string;
  scope: string;
  ttl: number | null; 
  createdAt: number;
}

export interface AgentRoleDB {
  id: string; // role id
  domain: string;
  specialization: string;
  owns: string[];
  excludes: string[];
  required_context: string[];
  output_schema: string;
  markdownContent?: string; // Content string for MD
  updatedAt: number;
}

export interface PythonSkillDB {
  id: string; // File name (e.g., 'hello_world.py')
  name: string; // Skill name
  code: string; // Python code
  description: string;
  isEnabled: boolean;
  updatedAt: number;
}

export const db = (typeof globalThis !== 'undefined' && typeof globalThis.indexedDB !== 'undefined'
  ? new Dexie('AIChatDB')
  : { version: () => ({ stores: () => { /* no-op */ } }) }) as Dexie & {
  sessions: EntityTable<ChatSessionDB, 'id'>;
  messages: EntityTable<ChatMessageDB, 'id'>;
  files: EntityTable<VFSFile, 'path'>;
  memories: EntityTable<AgentMemory, 'key'>;
  attachments: EntityTable<any, 'id'>;
  agent_roles: EntityTable<AgentRoleDB, 'id'>;
  python_skills: EntityTable<PythonSkillDB, 'id'>;
};

if (typeof globalThis !== 'undefined' && typeof globalThis.indexedDB !== 'undefined') {
  db.version(1).stores({
    sessions: 'id, title, createdAt, updatedAt',
    messages: 'id, sessionId, role, createdAt, [sessionId+createdAt]',
  });

  db.version(7).stores({
    sessions: 'id, title, createdAt, updatedAt, model',
    messages: 'id, sessionId, role, createdAt, [sessionId+createdAt]',
    files: 'path, updatedAt',
    memories: 'key, scope, createdAt',
    attachments: 'id, messageId, name, createdAt, [messageId+createdAt]',
  });

  db.version(8).stores({
    sessions: 'id, title, createdAt, updatedAt, model',
    messages: 'id, sessionId, role, createdAt, [sessionId+createdAt]',
    files: 'path, updatedAt',
    memories: 'key, scope, createdAt',
    attachments: 'id, messageId, name, createdAt, [messageId+createdAt]',
    agent_roles: 'id, domain, updatedAt'
  });

  db.version(9).stores({
    sessions: 'id, title, createdAt, updatedAt, model',
    messages: 'id, sessionId, role, createdAt, [sessionId+createdAt]',
    files: 'path, updatedAt',
    memories: 'key, scope, createdAt',
    attachments: 'id, messageId, name, createdAt, [messageId+createdAt]',
    agent_roles: 'id, domain, updatedAt',
    python_skills: 'id, name, isEnabled, updatedAt'
  });
}

@Injectable({ providedIn: 'root' })
export class DatabaseService {

  constructor() {
    this.seedDefaultSkills();
  }

  private async seedDefaultSkills() {
    if (typeof window === 'undefined' || typeof window.indexedDB === 'undefined') return;
    try {
      const count = await db.python_skills.count();
      if (count === 0) {
        await db.python_skills.bulkAdd([
          {
            id: 'perf_analyzer.py',
            name: 'Performance Analyzer',
            code: `def analyze_performance(data):\n    # Analisis data secara simulasi\n    print("Analyzing performance...")\n    return {"status": "optimized", "bottlenecks": [], "processed_items": len(data) if isinstance(data, list) else 1}`,
            description: 'Analyzes performance metrics and returns optimization targets.',
            isEnabled: true,
            updatedAt: Date.now()
          },
          {
            id: 'file_scanner.py',
            name: 'Directory Scanner',
            code: `import os\n\ndef scan_directory(path='.', max_depth=2):\n    """Surgical scanning: memindai metadata file tanpa isi code."""\n    structure = []\n    base_depth = path.count(os.sep)\n    for root, dirs, files in os.walk(path):\n        curr_depth = root.count(os.sep)\n        if curr_depth - base_depth <= max_depth:\n            structure.append({"path": root, "dirs": len(dirs), "files": len(files)})\n    return structure`,
            description: 'Scans the project directory structure safely via Surgical Scanning rules.',
            isEnabled: true,
            updatedAt: Date.now()
          },
          {
            id: 'self_improver.py',
            name: 'Self-Hosting Improver',
            code: `import asyncio
import inspect

async def improve(code: str, utility_fn, depth: int = 0, max_depth: int = 3):
    """
    Recursive self-improver.
    Args:
        code: Kode saat ini (harus sudah mengandung 'improve' atau seed awal).
        utility_fn: Fungsi evaluasi skor 0.0-1.0.
        depth: Kedalaman rekursi saat ini.
        max_depth: Batas aman agar tidak infinite loop.
    """
    if depth >= max_depth:
        print(f"[Depth {depth}] Max recursion reached. Returning current code.")
        return code
    
    print(f"[Depth {depth}] Spawning self-hosting successors...")
    self_source = inspect.getsource(improve)
    
    try:
        from recursive_ai import llm_query
    except ImportError:
        # Placeholder jika module tidak ada
        async def llm_query(prompt): return code

    tasks = [
        llm_query(
            f"You are evolving self-improving Python code.\\n\\n"
            f"STRICT REQUIREMENTS:\\n"
            f"1. Improve this code for speed, clarity, safety.\\n"
            f"2. The output MUST contain the 'improve()' function with identical signature.\\n"
            f"3. The output MUST be executable Python code.\\n"
            f"4. Preserve asyncio patterns and the utility_fn contract.\\n\\n"
            f"CURRENT CODE:\\n{code}\\n\\n"
            f"REFERENCE IMPLEMENTATION:\\n{self_source}"
        ) for _ in range(3)
    ]
    
    candidates = await asyncio.gather(*tasks)
    
    # --- EVALUASI ---
    scored = []
    for cand in candidates:
        try:
            if "async def improve" not in cand or "utility_fn" not in cand:
                continue
            compile(cand, '<string>', 'exec')
            score = await utility_fn(cand)
            scored.append((score, cand))
        except Exception:
            pass
    
    if not scored:
        return code
    
    scored.sort(key=lambda x: x[0], reverse=True)
    best_score, best_code = scored[0]
    return await improve(best_code, utility_fn, depth + 1, max_depth)

async def default_utility(code: str) -> float:
    score = 0.5
    if "async def improve" in code and "utility_fn" in code: score += 0.2
    if "asyncio.gather" in code: score += 0.1
    if "try:" in code and "except" in code: score += 0.1
    if len(code) > 5000: score -= 0.2
    return min(max(score, 0.0), 1.0)
`,
            description: 'Recursive self-improving code engine using Genetic Template injection.',
            isEnabled: true,
            updatedAt: Date.now()
          }
        ]);
      }
    } catch (e) {
      console.warn('gagal seed default python skills:', e);
    }
  }

  async createSession(id: string, title: string, model = 'gemini-3-flash-preview'): Promise<string> {
    if (typeof window === 'undefined' || typeof window.indexedDB === 'undefined') return id;
    const now = new Date();
    await db.sessions.put({
      id,
      title,
      model,
      createdAt: now,
      updatedAt: now,
    });
    return id;
  }

  async saveMessage(
    sessionId: string,
    message: { id: string; role: 'user' | 'model'; text: string; attachments?: any[]; isStreaming?: boolean }
  ): Promise<void> {
    if (typeof window === 'undefined' || typeof window.indexedDB === 'undefined') return;
    const now = new Date();
    await db.transaction('rw', db.sessions, db.messages, async () => {
      await db.messages.put({
        id: message.id,
        sessionId,
        role: message.role,
        text: message.text,
        attachments: message.attachments ? JSON.stringify(message.attachments) : undefined,
        isStreaming: message.isStreaming,
        createdAt: now,
      });
      await db.sessions.update(sessionId, { updatedAt: now });
    });
  }

  async updateMessageText(messageId: string, text: string, isStreaming = false, thinkSession?: string): Promise<void> {
    if (typeof window === 'undefined' || typeof window.indexedDB === 'undefined') return;
    await db.messages.update(messageId, { text, isStreaming, thinkSession });
  }

  async getSessionMessages(sessionId: string): Promise<ChatMessageDB[]> {
    if (typeof window === 'undefined' || typeof window.indexedDB === 'undefined') return [];
    return db.messages.where('sessionId').equals(sessionId).sortBy('createdAt');
  }

  async getAllSessions(): Promise<ChatSessionDB[]> {
    if (typeof window === 'undefined' || typeof window.indexedDB === 'undefined') return [];
    return db.sessions.orderBy('updatedAt').reverse().toArray();
  }

  async deleteSession(sessionId: string): Promise<void> {
    if (typeof window === 'undefined' || typeof window.indexedDB === 'undefined') return;
    await db.transaction('rw', db.sessions, db.messages, async () => {
      await db.messages.where('sessionId').equals(sessionId).delete();
      await db.sessions.delete(sessionId);
    });
  }
}
