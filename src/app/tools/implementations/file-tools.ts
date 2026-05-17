import type { ToolRegistryEntry, ToolExecutionContext, ToolResult } from './types';
import { db } from '../../core/services/db.service';

// ============================================================
// BATCH OPERATIONS (Hindari N+1 query)
// ============================================================

async function getAllFiles(): Promise<{ path: string; content: string }[]> {
  return db.files.toArray();
}

// ============================================================
// FILE TOOLS REGISTRY
// ============================================================

export const fileTools: Record<string, ToolRegistryEntry> = {
  read_file: {
    definition: {
      name: 'read_file',
      description: 'Baca konten file dari Virtual File System. Mendukung partial read dengan offset/limit.',
      parameters: [
        { 
          name: 'path', 
          type: 'string', 
          description: 'Path relatif file', 
          required: true 
        },
        { 
          name: 'offset', 
          type: 'number', 
          description: 'Line offset (0-based)', 
          required: false,
          default: 0
        },
        { 
          name: 'limit', 
          type: 'number', 
          description: 'Jumlah maksimal line', 
          required: false,
          default: Infinity
        },
      ],
      routing: {
        priority: 10, // High priority — sering dipanggil
        timeoutMs: 5000,
        retryable: false,
        maxRetries: 0,
        cacheable: true,
        cacheTtlMs: 30000,
      },
    },
    executor: async (ctx: ToolExecutionContext): Promise<ToolResult> => {
      const startTime = performance.now();
      const { path, offset, limit } = ctx.args as { path: string; offset: number; limit: number };

      try {
        const file = await db.files.get(String(path));
        
        if (!file) {
          return {
            status: 'error',
            output: `File tidak ditemukan: ${path}`,
            metadata: {
              toolName: 'read_file',
              executionTimeMs: Math.round(performance.now() - startTime),
              attemptCount: 1,
              cached: false,
              truncated: false,
              errorType: 'runtime',
              errorCode: 'FILE_NOT_FOUND',
            },
          };
        }

        let lines = file.content.split('\n');
        const totalLines = lines.length;
        
        // Branchless slice
        const startIdx = Math.max(0, Number(offset) || 0);
        const endIdx = limit === Infinity ? totalLines : Math.min(startIdx + (Number(limit) || totalLines), totalLines);
        lines = lines.slice(startIdx, endIdx);

        const output = lines.join('\n');
        const truncated = output.length !== file.content.length;

        return {
          status: 'success',
          output,
          data: {
            path,
            size: file.content.length,
            totalLines,
            readLines: lines.length,
          },
          metadata: {
            toolName: 'read_file',
            executionTimeMs: Math.round(performance.now() - startTime),
            attemptCount: 1,
            cached: false,
            truncated,
          },
        };

      } catch (error) {
        return {
          status: 'error',
          output: `Gagal membaca file: ${error instanceof Error ? error.message : 'Unknown error'}`,
          metadata: {
            toolName: 'read_file',
            executionTimeMs: Math.round(performance.now() - startTime),
            attemptCount: 1,
            cached: false,
            truncated: false,
            errorType: 'runtime',
            errorCode: 'READ_ERROR',
          },
        };
      }
    },
  },

  write_file: {
    definition: {
      name: 'write_file',
      description: 'Tulis atau overwrite file di Virtual File System. Mendukung append mode.',
      parameters: [
        { name: 'path', type: 'string', description: 'Path relatif file target', required: true },
        { name: 'content', type: 'string', description: 'Konten yang akan ditulis', required: true },
        { name: 'append', type: 'boolean', description: 'Append ke file existing', required: false, default: false },
      ],
      routing: {
        priority: 8,
        timeoutMs: 5000,
        retryable: true,
        maxRetries: 2,
        cacheable: false, // Write tidak di-cache
        cacheTtlMs: 0,
      },
    },
    executor: async (ctx: ToolExecutionContext): Promise<ToolResult> => {
      const startTime = performance.now();
      const { path, content, append } = ctx.args as { path: string; content: string; append: boolean };

      try {
        const now = new Date();
        const existingFile = await db.files.get(String(path));
        
        let finalContent = String(content);
        if (append && existingFile) {
          finalContent = existingFile.content + finalContent;
        }

        await db.files.put({
          path: String(path),
          content: finalContent,
          createdAt: existingFile ? existingFile.createdAt : now,
          updatedAt: now,
        });

        // Invalidate cache untuk file ini
        // (Cache invalidation logic di pipeline)

        return {
          status: 'success',
          output: `File berhasil disimpan: ${path}`,
          data: { path, bytes: finalContent.length, appended: !!append },
          metadata: {
            toolName: 'write_file',
            executionTimeMs: Math.round(performance.now() - startTime),
            attemptCount: 1,
            cached: false,
            truncated: false,
          },
        };

      } catch (error) {
        return {
          status: 'error',
          output: `Gagal menulis file: ${error instanceof Error ? error.message : 'Unknown error'}`,
          metadata: {
            toolName: 'write_file',
            executionTimeMs: Math.round(performance.now() - startTime),
            attemptCount: 1,
            cached: false,
            truncated: false,
            errorType: 'runtime',
            errorCode: 'WRITE_ERROR',
          },
        };
      }
    },
  },

  list_directory: {
    definition: {
      name: 'list_directory',
      description: 'List semua file dan folder dalam VFS. Mendukung nested directory listing.',
      parameters: [
        { name: 'path', type: 'string', description: 'Path directory (gunakan "." untuk root)', required: true },
      ],
      routing: {
        priority: 9,
        timeoutMs: 3000,
        retryable: false,
        maxRetries: 0,
        cacheable: true,
        cacheTtlMs: 15000,
      },
    },
    executor: async (ctx: ToolExecutionContext): Promise<ToolResult> => {
      const startTime = performance.now();
      let basePath = String(ctx.args['path'] || '');

      try {
        // Normalisasi path (branchless)
        const isRoot = basePath === '.' || basePath === './' || basePath === '/' || basePath === '';
        basePath = isRoot ? '' : basePath.endsWith('/') ? basePath : basePath + '/';

        // Single query — batch operation
        const allFiles = await getAllFiles();
        const entries = new Set<string>();

        allFiles.forEach(file => {
          if (basePath === '' || file.path.startsWith(basePath)) {
            const relativePath = basePath ? file.path.substring(basePath.length) : file.path;
            const parts = relativePath.split('/').filter(Boolean);
            if (parts.length > 1) {
              entries.add(`📁 ${parts[0]}/`);
            } else if (parts.length === 1) {
              entries.add(`📄 ${parts[0]}`);
            }
          }
        });

        const arr = Array.from(entries).sort();

        return {
          status: 'success',
          output: arr.length > 0 ? arr.join('\n') : '(empty directory)',
          data: { path: basePath || '/', count: arr.length },
          metadata: {
            toolName: 'list_directory',
            executionTimeMs: Math.round(performance.now() - startTime),
            attemptCount: 1,
            cached: false,
            truncated: false,
          },
        };

      } catch (error) {
        return {
          status: 'error',
          output: `Gagal list directory: ${error instanceof Error ? error.message : 'Unknown error'}`,
          metadata: {
            toolName: 'list_directory',
            executionTimeMs: Math.round(performance.now() - startTime),
            attemptCount: 1,
            cached: false,
            truncated: false,
            errorType: 'runtime',
            errorCode: 'LIST_ERROR',
          },
        };
      }
    },
  },

  search_files: {
    definition: {
      name: 'search_files',
      description: 'Search text dalam file di VFS menggunakan substring matching. Mendukung regex sederhana.',
      parameters: [
        { name: 'path', type: 'string', description: 'Directory untuk search', required: true },
        { name: 'query', type: 'string', description: 'Text yang dicari', required: true },
        { name: 'regex', type: 'boolean', description: 'Gunakan regex matching', required: false, default: false },
      ],
      routing: {
        priority: 4,
        timeoutMs: 10000,
        retryable: false,
        maxRetries: 0,
        cacheable: true,
        cacheTtlMs: 20000,
      },
    },
    executor: async (ctx: ToolExecutionContext): Promise<ToolResult> => {
      const startTime = performance.now();
      let basePath = String(ctx.args['path'] || '');
      const query = String(ctx.args['query'] || '');
      const useRegex = Boolean(ctx.args['regex']);

      try {
        if (!query) {
          return {
            status: 'error',
            output: 'Query pencarian tidak boleh kosong',
            metadata: {
              toolName: 'search_files',
              executionTimeMs: Math.round(performance.now() - startTime),
              attemptCount: 1,
              cached: false,
              truncated: false,
              errorType: 'validation',
              errorCode: 'EMPTY_QUERY',
            },
          };
        }

        const isRoot = basePath === '.' || basePath === './' || basePath === '/' || basePath === '';
        basePath = isRoot ? '' : basePath.endsWith('/') ? basePath : basePath + '/';

        let matcher: (line: string) => boolean;
        if (useRegex) {
          try {
            const regex = new RegExp(query);
            matcher = (line: string) => regex.test(line);
          } catch {
            return {
              status: 'error',
              output: 'Invalid regex pattern',
              metadata: {
                toolName: 'search_files',
                executionTimeMs: Math.round(performance.now() - startTime),
                attemptCount: 1,
                cached: false,
                truncated: false,
                errorType: 'validation',
                errorCode: 'INVALID_REGEX',
              },
            };
          }
        } else {
          matcher = (line: string) => line.includes(query);
        }

        // Batch query
        const allFiles = await getAllFiles();
        const results: string[] = [];
        let matchCount = 0;

        allFiles.forEach(file => {
          if (basePath === '' || file.path.startsWith(basePath)) {
            const lines = file.content.split('\n');
            lines.forEach((line, index) => {
              if (matcher(line)) {
                matchCount++;
                // Limit output untuk performa
                if (results.length < 1000) {
                  results.push(`${file.path}:${index + 1}: ${line.trim()}`);
                }
              }
            });
          }
        });

        const truncated = matchCount > results.length;

        return {
          status: 'success',
          output: results.length > 0 ? results.join('\n') : '(no results found)',
          data: { 
            query, 
            regex: useRegex,
            totalMatches: matchCount,
            displayedMatches: results.length 
          },
          metadata: {
            toolName: 'search_files',
            executionTimeMs: Math.round(performance.now() - startTime),
            attemptCount: 1,
            cached: false,
            truncated,
          },
        };

      } catch (error) {
        return {
          status: 'error',
          output: `Gagal search files: ${error instanceof Error ? error.message : 'Unknown error'}`,
          metadata: {
            toolName: 'search_files',
            executionTimeMs: Math.round(performance.now() - startTime),
            attemptCount: 1,
            cached: false,
            truncated: false,
            errorType: 'runtime',
            errorCode: 'SEARCH_ERROR',
          },
        };
      }
    },
  },
};
