import type { ToolRegistryEntry, ToolExecutionContext, ToolResult } from './types';

export const serverTools: Record<string, ToolRegistryEntry> = {
  execute_node_server: {
    definition: {
      name: 'execute_node_server',
      description: 'Mengeksekusi skrip Node.js langsung di backend server (Express.js). Gunakan ini jika agen butuh akses filesystem (fs), atau library Node.js native.',
      parameters: [
        {
          name: 'code',
          type: 'string',
          description: 'Kode asinkron Node.js. Fungsi ini di wrap dalam async function dengan parameter: require, console',
          required: true,
        }
      ],
      routing: {
        priority: 5,
        timeoutMs: 30000,
        retryable: false,
        maxRetries: 0,
        cacheable: false,
        cacheTtlMs: 0
      },
    },
    executor: async (ctx: ToolExecutionContext): Promise<ToolResult> => {
      const startTime = Date.now();
      try {
        const response = await fetch('/api/agent-bridge', {
           method: 'POST',
           headers: { 'Content-Type': 'application/json' },
           body: JSON.stringify({ 
              action: 'execute_node', 
              token: 'LUMINA_SECRET_BRIDGE_TOKEN_998',
              payload: { code: ctx.args['code'] } 
           })
        });
        
        if (!response.ok) {
           throw new Error(`HTTP Error ${response.status}: ${response.statusText}`);
        }
        
        const data = await response.json();
        
        return {
           status: data.success ? 'success' : 'error',
           output: data.success ? `Execution successful. Output:\n${data.output}` : `Execution failed: ${data.error}`,
           data: {
              result: data.result,
              output: data.output,
              error: data.error
           },
           metadata: {
              toolName: 'execute_node_server',
              executionTimeMs: Date.now() - startTime,
              attemptCount: 1,
              cached: false,
              truncated: false,
              errorType: data.success ? undefined : 'runtime'
           }
        };
      } catch (e: any) {
         return {
            status: 'error',
            output: `Gagal mengeksekusi di server: ${e.message}`,
            metadata: {
              toolName: 'execute_node_server',
              executionTimeMs: Date.now() - startTime,
              attemptCount: 1,
              cached: false,
              truncated: false,
              errorType: 'network'
            }
         };
      }
    },
  },
  request_edge_proxy: {
    definition: {
      name: 'request_edge_proxy',
      description: 'Memerintahkan backend Edge Proxy (port 3005) untuk melakukan tugas jaringan dari sisi server. Berguna untuk mem-bypass batasan CORS klien atau melakukan background task rahasia.',
      parameters: [
        {
          name: 'path',
          type: 'string',
          description: 'Endpoint di server proksi (contoh: /health atau /proxy-test)',
          required: true,
        },
        {
          name: 'method',
          type: 'string',
          description: 'HTTP method (GET, POST, dll)',
          required: false,
        }
      ],
      routing: {
        priority: 5,
        timeoutMs: 15000,
        retryable: true,
        maxRetries: 1,
        cacheable: false,
        cacheTtlMs: 0
      },
    },
    executor: async (ctx: ToolExecutionContext): Promise<ToolResult> => {
      const startTime = Date.now();
      try {
        const method = ctx.args['method'] || 'GET';
        // Karena port 3005 tak bisa diakses browser, kita minta backend port 3000 menjembataninya.
        // Untuk sekarang, karena dari Angular, kita harus minta Node backend mengeksekusi request internal ke 3005
        const codeBridge = `
           const http = require('http');
           return new Promise((resolve, reject) => {
             const req = http.request({
               hostname: '127.0.0.1',
               port: 3005,
               path: '${ctx.args['path']}',
               method: '${method}'
             }, (res) => {
               let data = '';
               res.on('data', chunk => data += chunk);
               res.on('end', () => resolve({ status: res.statusCode, data }));
             });
             req.on('error', reject);
             req.end();
           });
        `;
        
        const response = await fetch('/api/agent-bridge', {
           method: 'POST',
           headers: { 'Content-Type': 'application/json' },
           body: JSON.stringify({ 
              action: 'execute_node', 
              token: 'LUMINA_SECRET_BRIDGE_TOKEN_998',
              payload: { code: codeBridge } 
           })
        });

        const data = await response.json();
        
        return {
           status: data.success ? 'success' : 'error',
           output: data.success ? `Edge Server Responsed: ${JSON.stringify(data.result)}` : `Gagal: ${data.error}`,
           data: data.result,
           metadata: {
              toolName: 'request_edge_proxy',
              executionTimeMs: Date.now() - startTime,
              attemptCount: 1,
              cached: false,
              truncated: false
           }
        };
      } catch (e: any) {
         return {
            status: 'error',
            output: `Koneksi ke Edge Server gagal: ${e.message}`,
            metadata: {
              toolName: 'request_edge_proxy',
              executionTimeMs: Date.now() - startTime,
              attemptCount: 1,
              cached: false,
              truncated: false,
              errorType: 'network'
            }
         };
      }
    }
  }
};

