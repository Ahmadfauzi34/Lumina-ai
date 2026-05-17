import {
  AngularNodeAppEngine,
  createNodeRequestHandler,
  isMainModule,
  writeResponseToNodeResponse,
} from '@angular/ssr/node';
import express from 'express';
import {join} from 'node:path';

const browserDistFolder = join(import.meta.dirname, '../browser');

const app = express();
const angularApp = new AngularNodeAppEngine();

app.use(express.json());

/**
 * Endpoint Jembatan Agen Lumina -> Server Node.js
 */
import { createRequire } from 'module';

app.post('/api/agent-bridge', async (req, res) => {
  try {
    const { action, payload, token } = req.body;
    
    // Keamanan Sederhana: Token rahasia agen
    if (token !== 'LUMINA_SECRET_BRIDGE_TOKEN_998') {
      res.status(403).json({ success: false, error: 'Akses Ditolak. Token tidak valid.' });
      return;
    }
    
    if (action === 'execute_node') {
       const code = payload?.code || '';
       let output = '';
       
       // Meng-override console agar output ter-capture
       const logCaptured = (...args: any[]) => { output += args.join(' ') + '\n'; };
       const fakeConsole = { log: logCaptured, error: logCaptured, warn: logCaptured, info: logCaptured };
       
       // Menjalankan eval code dalam async context
       const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;
       
       const customRequire = createRequire(import.meta.url);
       
       const fn = new AsyncFunction('console', 'require', 'importModule', code);
       
       // Sediakan utility `importModule` sebagai pengganti require di ESM
       const importModule = async (moduleName: string) => await import(moduleName);
       
       const result = await fn(fakeConsole, customRequire, importModule);

       res.json({ success: true, result, output: output.trim() });
    } else {
       res.status(400).json({ success: false, error: 'Aksi tidak didukung' });
    }
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message, stack: err.stack });
  }
});

/**
 * Example Express Rest API endpoints can be defined here.
 * Uncomment and define endpoints as necessary.
 *
 * Example:
 * ```ts
 * app.get('/api/{*splat}', (req, res) => {
 *   // Handle API request
 * });
 * ```
 */

/**
 * Serve static files from /browser
 */
app.use(
  express.static(browserDistFolder, {
    maxAge: '1y',
    index: false,
    redirect: false,
  }),
);

/**
 * Handle all other requests by rendering the Angular application.
 */
app.use((req, res, next) => {
  angularApp
    .handle(req)
    .then((response) =>
      response ? writeResponseToNodeResponse(response, res) : next(),
    )
    .catch(next);
});

/**
 * Start the server if this module is the main entry point, or it is ran via PM2.
 * The server listens on the port defined by the `PORT` environment variable, or defaults to 4000.
 */
if (isMainModule(import.meta.url) || process.env['pm_id']) {
  const port = process.env['PORT'] || 4000;
  app.listen(port, (error) => {
    if (error) {
      throw error;
    }

    console.log(`Node Express server listening on http://localhost:${port}`);
  });
}

/**
 * Request handler used by the Angular CLI (for dev-server and during build) or Firebase Cloud Functions.
 */
export const reqHandler = createNodeRequestHandler(app);

// ==========================================
// INTERNAL EDGE SERVER (Port 3005)
// ==========================================
import http from 'http';

function startInternalEdgeServer() {
  const edgePort = 3005;
  const edgeApp = express();
  
  edgeApp.get('/health', (req, res) => {
    res.json({ status: "ALIVE", orchestrator: "Lumina Edge", internal: true });
  });

  edgeApp.all('/proxy-test', (req, res) => {
    res.send("Proxy Bridge Active: Ready to route internal traffic/outbound.");
  });

  const edgeServer = http.createServer(edgeApp);
  edgeServer.listen(edgePort, '0.0.0.0', () => {
    console.log(`[LUMINA EDGE SERVER] Internal Bridge listening on http://0.0.0.0:${edgePort}`);
  });
}

// Hanya start jika ini adalah main module (sama seperti port 4000/3000)
if (isMainModule(import.meta.url) || process.env['pm_id']) {
   startInternalEdgeServer();
}
