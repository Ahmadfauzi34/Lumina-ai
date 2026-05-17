/// <reference lib="webworker" />

// ============================================================
// TYPE DEFINITIONS
// ============================================================

interface ExecutionRequest {
  id: string;
  language: string;
  code: string;
  stdin?: string;
  args?: string[];
  timeout?: number;       // ms, default 30000
  maxOutputSize?: number; // bytes, default 1MB
  cacheKey?: string;      // untuk deduplication
  metadata?: Record<string, unknown>;
}

interface GodboltLine {
  text: string;
  tag?: { line?: number; file?: string };
}

interface GodboltResult {
  code: number;
  stdout?: GodboltLine[];
  stderr?: GodboltLine[];
  buildResult?: {
    code: number;
    stdout?: GodboltLine[];
    stderr?: GodboltLine[];
    timedOut?: boolean;
  };
  timedOut?: boolean;
  execTime?: number;
}

interface ExecutionResponse {
  id: string;
  status: 'success' | 'error' | 'timeout' | 'killed';
  output: string;
  stdout: string;
  stderr: string;
  buildOutput: string;
  metadata: {
    language: string;
    compiler: string;
    exitCode: number;
    executionTime: number;
    timedOut: boolean;
    outputTruncated: boolean;
  };
  error?: {
    type: 'network' | 'compiler' | 'runtime' | 'timeout' | 'validation' | 'unknown';
    message: string;
    details?: string;
  };
}

// ============================================================
// CONFIGURATION & CONSTANTS
// ============================================================

const CONFIG = {
  DEFAULT_TIMEOUT: 30000,
  MAX_OUTPUT_SIZE: 1024 * 1024, // 1MB
  MAX_CODE_SIZE: 1024 * 1024,   // 1MB
  MAX_STDIN_SIZE: 64 * 1024,    // 64KB
  RETRY_ATTEMPTS: 2,
  RETRY_DELAY: 1000,
  GODBOLT_BASE: 'https://godbolt.org/api',
  RATE_LIMIT_MS: 500,           // minimum delay between requests
} as const;

const COMPILER_MAP: Record<string, { id: string; name: string; fallback?: string }> = {
  // JavaScript / TypeScript
  'javascript': { id: 'v8trunk', name: 'V8 (JavaScript)' },
  'js':         { id: 'v8trunk', name: 'V8 (JavaScript)' },
  'node':       { id: 'v8trunk', name: 'V8 (JavaScript)' },
  'nodejs':     { id: 'v8trunk', name: 'V8 (JavaScript)' },
  'typescript': { id: 'v8trunk', name: 'V8 (JavaScript)' },
  'ts':         { id: 'v8trunk', name: 'V8 (JavaScript)' },
  
  // Python
  'python':     { id: 'python311', name: 'Python 3.11', fallback: 'python310' },
  'py':         { id: 'python311', name: 'Python 3.11', fallback: 'python310' },
  'python3':    { id: 'python311', name: 'Python 3.11', fallback: 'python310' },
  'python2':    { id: 'python27', name: 'Python 2.7' },
  
  // C / C++
  'c':          { id: 'cg141', name: 'GCC 14.1 (C)', fallback: 'cg131' },
  'c++':        { id: 'g141', name: 'GCC 14.1 (C++)', fallback: 'g131' },
  'cpp':        { id: 'g141', name: 'GCC 14.1 (C++)', fallback: 'g131' },
  'c++17':      { id: 'g141', name: 'GCC 14.1 (C++17)', fallback: 'g131' },
  'c++20':      { id: 'g141', name: 'GCC 14.1 (C++20)', fallback: 'g131' },
  'clang':      { id: 'clang1400', name: 'Clang 14.0', fallback: 'clang1300' },
  
  // Java
  'java':       { id: 'jdk230', name: 'OpenJDK 23', fallback: 'jdk220' },
  
  // Rust
  'rust':       { id: 'r1820', name: 'Rust 1.82', fallback: 'r1810' },
  'rs':         { id: 'r1820', name: 'Rust 1.82', fallback: 'r1810' },
  
  // Go
  'go':         { id: 'gl1200', name: 'Go 1.20' },
  'golang':     { id: 'gl1200', name: 'Go 1.20' },
  
  // C#
  'csharp':     { id: 'dotnet70700', name: '.NET 7.0' },
  'cs':         { id: 'dotnet70700', name: '.NET 7.0' },
  
  // Ruby
  'ruby':       { id: 'ruby330', name: 'Ruby 3.3' },
  'rb':         { id: 'ruby330', name: 'Ruby 3.3' },
  
  // PHP
  'php':        { id: 'php820', name: 'PHP 8.2' },
  
  // Swift
  'swift':      { id: 'swift510', name: 'Swift 5.10' },
  
  // Kotlin
  'kotlin':     { id: 'kotlin190', name: 'Kotlin 1.9' },
  'kt':         { id: 'kotlin190', name: 'Kotlin 1.9' },
  
  // Zig
  'zig':        { id: 'zig0130', name: 'Zig 0.13' },
  
  // Assembly
  'asm':        { id: 'nasm21603', name: 'NASM 2.16' },
  'nasm':       { id: 'nasm21603', name: 'NASM 2.16' },
};

// ============================================================
// IN-MEMORY CACHE (LRU-style dengan limit)
// ============================================================

class LRUCache<K, V> {
  private cache = new Map<K, V>();
  
  constructor(private maxSize = 50) {}
  
  get(key: K): V | undefined {
    const value = this.cache.get(key);
    if (value !== undefined) {
      // Move to end (most recently used)
      this.cache.delete(key);
      this.cache.set(key, value);
    }
    return value;
  }
  
  set(key: K, value: V): void {
    if (this.cache.has(key)) {
      this.cache.delete(key);
    } else if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey !== undefined) {
        this.cache.delete(firstKey);
      }
    }
    this.cache.set(key, value);
  }
  
  clear(): void {
    this.cache.clear();
  }
}

const resultCache = new LRUCache<string, ExecutionResponse>(50);

// ============================================================
// RATE LIMITER
// ============================================================

let lastRequestTime = 0;

async function rateLimit(): Promise<void> {
  const now = Date.now();
  const elapsed = now - lastRequestTime;
  if (elapsed < CONFIG.RATE_LIMIT_MS) {
    await sleep(CONFIG.RATE_LIMIT_MS - elapsed);
  }
  lastRequestTime = Date.now();
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ============================================================
// INPUT VALIDATION & SANITIZATION
// ============================================================

class ValidationError extends Error {
  constructor(message: string, public details?: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

function validateRequest(data: unknown): ExecutionRequest {
  if (!data || typeof data !== 'object') {
    throw new ValidationError('Invalid request: expected object');
  }
  
  const req = data as Partial<ExecutionRequest>;
  
  // ID validation - Allow to be autogenerated if missing
  const id = req.id || `exec-${Date.now()}`;
  
  // Language validation
  const language = String(req.language || '').toLowerCase().trim();
  if (!language) {
    throw new ValidationError('Missing language');
  }
  
  // Code validation
  const code = String(req.code || '');
  if (!code.trim()) {
    throw new ValidationError('Empty code');
  }
  if (code.length > CONFIG.MAX_CODE_SIZE) {
    throw new ValidationError(
      `Code too large: ${code.length} bytes (max ${CONFIG.MAX_CODE_SIZE})`,
      'CODE_SIZE_EXCEEDED'
    );
  }
  
  // Stdin validation
  const stdin = String(req.stdin || '');
  if (stdin.length > CONFIG.MAX_STDIN_SIZE) {
    throw new ValidationError(
      `Stdin too large: ${stdin.length} bytes (max ${CONFIG.MAX_STDIN_SIZE})`,
      'STDIN_SIZE_EXCEEDED'
    );
  }
  
  let parsedArgs: string[] = [];
  if (Array.isArray(req.args)) {
    parsedArgs = req.args.map(String);
  } else if (typeof req.args === 'string') {
    // If it's a string, we simply leave it as is if it will just be stringified later, 
    // or parse it if array is strictly required. For safety, split by space.
    parsedArgs = (req.args as unknown as string).split(' ').filter(Boolean);
  }
  
  return {
    id,
    language,
    code,
    stdin,
    args: parsedArgs,
    timeout: Math.min(req.timeout || CONFIG.DEFAULT_TIMEOUT, 120000),
    maxOutputSize: Math.min(req.maxOutputSize || CONFIG.MAX_OUTPUT_SIZE, 5 * 1024 * 1024),
    cacheKey: req.cacheKey,
    metadata: req.metadata,
  };
}

function sanitizeCode(code: string): string {
  // Basic sanitization - remove null bytes dan control characters berbahaya
  return code
    .replace(new RegExp('\\x00', 'g'), '')           // Null bytes
    .replace(new RegExp('[\\x01-\\x08\\x0b\\x0c\\x0e-\\x1f\\x7f]', 'g'), ''); // Control chars kecuali \t, \n, \r
}

// ============================================================
// OUTPUT PROCESSING
// ============================================================

function extractLines(lines: GodboltLine[] | undefined): string {
  if (!lines || !Array.isArray(lines)) return '';
  return lines
    .filter(line => line && typeof line.text === 'string')
    .map(line => line.text)
    .join('\\n');
}

function truncateOutput(output: string, maxBytes: number): { text: string; truncated: boolean } {
  const encoder = new TextEncoder();
  const bytes = encoder.encode(output);
  
  if (bytes.length <= maxBytes) {
    return { text: output, truncated: false };
  }
  
  // Truncate dengan tetap mempertahankan valid UTF-8
  let truncated = output;
  while (encoder.encode(truncated).length > maxBytes && truncated.length > 0) {
    truncated = truncated.slice(0, -1);
  }
  
  return { 
    text: truncated + '\\n\\n[... output truncated due to size limit ...]', 
    truncated: true 
  };
}

// ============================================================
// COMPILER API CLIENT
// ============================================================

class GodboltClient {
  private abortController: AbortController | null = null;
  
  async compile(
    compilerId: string,
    code: string,
    stdin: string,
    args: string[],
    timeout: number
  ): Promise<{ result: GodboltResult; responseTime: number }> {
    await rateLimit();
    
    const payload = {
      source: code,
      options: {
        userArguments: args.join(' '),
        executeParameters: { 
          args: args, 
          stdin: stdin,
          timeout: Math.ceil(timeout / 1000) // Godbolt expects seconds
        },
        compilerOptions: { executorRequest: true },
        filters: { execute: true },
        tools: []
      },
      allowStoreCodeDebug: true
    };
    
    this.abortController = new AbortController();
    const timeoutId = setTimeout(() => this.abortController?.abort(), timeout + 5000);
    
    const startTime = performance.now();
    
    try {
      const response = await fetch(
        `${CONFIG.GODBOLT_BASE}/compiler/${compilerId}/compile`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
          },
          body: JSON.stringify(payload),
          signal: this.abortController.signal,
        }
      );
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        const errorBody = await response.text().catch(() => 'Unknown error');
        throw new CompilerAPIError(
          `HTTP ${response.status}: ${response.statusText}`,
          response.status,
          errorBody
        );
      }
      
      const result: GodboltResult = await response.json();
      const responseTime = Math.round(performance.now() - startTime);
      
      return { result, responseTime };
      
    } catch (error) {
      clearTimeout(timeoutId);
      
      if (error instanceof CompilerAPIError) throw error;
      
      if (error instanceof Error && error.name === 'AbortError') {
        throw new CompilerAPIError('Request timeout or aborted', 0, 'TIMEOUT');
      }
      
      throw new CompilerAPIError(
        `Network error: ${error instanceof Error ? error.message : String(error)}`,
        0,
        'NETWORK_ERROR'
      );
    } finally {
      this.abortController = null;
    }
  }
  
  abort(): void {
    this.abortController?.abort();
  }
}

class CompilerAPIError extends Error {
  constructor(
    message: string,
    public statusCode = 0,
    public errorType = 'UNKNOWN'
  ) {
    super(message);
    this.name = 'CompilerAPIError';
  }
}

// ============================================================
// MAIN EXECUTION PIPELINE
// ============================================================

async function executeCode(request: ExecutionRequest): Promise<ExecutionResponse> {
  const startTime = performance.now();
  const client = new GodboltClient();
  
  try {
    // 1. Check cache
    if (request.cacheKey) {
      const cached = resultCache.get(request.cacheKey);
      if (cached) {
        return {
          ...cached,
          id: request.id,
          metadata: { ...cached.metadata, cached: true }
        } as unknown as ExecutionResponse;
      }
    }
    
    // 2. Resolve compiler
    const compilerInfo = COMPILER_MAP[request.language];
    if (!compilerInfo) {
      const available = Object.keys(COMPILER_MAP).join(', ');
      return buildErrorResponse(
        request.id,
        'validation',
        `Unsupported language: "${request.language}"`,
        `Available languages: ${available}`,
        startTime
      );
    }
    
    // 3. Sanitize code
    const sanitizedCode = sanitizeCode(request.code);
    
    // 4. Try primary compiler, fallback if needed
    let compileResult: GodboltResult;
    let responseTime: number;
    let usedCompiler = compilerInfo.id;
    
    try {
      const result = await client.compile(
        compilerInfo.id,
        sanitizedCode,
        request.stdin || '',
        request.args || [],
        request.timeout!
      );
      compileResult = result.result;
      responseTime = result.responseTime;
    } catch (primaryError) {
      // Try fallback compiler if available
      if (compilerInfo.fallback && primaryError instanceof CompilerAPIError) {
        console.warn(`Primary compiler ${compilerInfo.id} failed, trying fallback ${compilerInfo.fallback}`);
        try {
          const fallbackResult = await client.compile(
            compilerInfo.fallback,
            sanitizedCode,
            request.stdin || '',
            request.args || [],
            request.timeout!
          );
          compileResult = fallbackResult.result;
          responseTime = fallbackResult.responseTime;
          usedCompiler = compilerInfo.fallback;
        } catch {
          // ignore fallback error
          throw primaryError; // Throw original error
        }
      } else {
        throw primaryError;
      }
    }
    
    // 5. Process outputs
    const stdout = extractLines(compileResult.stdout);
    const stderr = extractLines(compileResult.stderr);
    const buildStdout = extractLines(compileResult.buildResult?.stdout);
    const buildStderr = extractLines(compileResult.buildResult?.stderr);
    const buildOutput = [buildStdout, buildStderr].filter(Boolean).join('\\n');
    
    // 6. Determine status
    let status: ExecutionResponse['status'] = 'success';
    let error: ExecutionResponse['error'] | undefined;
    
    const exitCode = compileResult.code ?? compileResult.buildResult?.code ?? 1;
    const timedOut = compileResult.timedOut || compileResult.buildResult?.timedOut || false;
    
    if (timedOut) {
      status = 'timeout';
      error = {
        type: 'timeout',
        message: `Execution exceeded ${request.timeout}ms timeout`,
      };
    } else if (exitCode !== 0 && (!stdout && !stderr)) {
      status = 'error';
      // Determine if it's a compiler error or runtime error
      const hasBuildErrors = buildStderr.length > 0;
      error = {
        type: hasBuildErrors ? 'compiler' : 'runtime',
        message: hasBuildErrors ? 'Compilation failed' : 'Runtime error',
        details: hasBuildErrors ? buildStderr : stderr,
      };
    } else if (exitCode !== 0) {
      status = 'error';
    }
    
    // 7. Truncate output if needed
    const fullOutput = [stdout, stderr].filter(s => s.trim().length > 0).join('\\n') || '(no output)';
    const { text: truncatedOutput, truncated } = truncateOutput(fullOutput, request.maxOutputSize!);
    
    // 8. Build response
    const response: ExecutionResponse = {
      id: request.id,
      status,
      output: truncatedOutput,
      stdout,
      stderr,
      buildOutput,
      metadata: {
        language: request.language,
        compiler: usedCompiler,
        exitCode,
        executionTime: responseTime,
        timedOut,
        outputTruncated: truncated,
      },
      error,
    };
    
    // 9. Cache successful results
    if (request.cacheKey && status === 'success') {
      resultCache.set(request.cacheKey, response);
    }
    
    return response;
    
  } catch (error) {
    // Handle different error types
    if (error instanceof ValidationError) {
      return buildErrorResponse(
        request.id,
        'validation',
        error.message,
        error.details,
        startTime
      );
    }
    
    if (error instanceof CompilerAPIError) {
      return buildErrorResponse(
        request.id,
        error.statusCode === 429 ? 'network' : 
        error.errorType === 'TIMEOUT' ? 'timeout' : 'network',
        error.message,
        `Type: ${error.errorType}, Status: ${error.statusCode}`,
        startTime
      );
    }
    
    return buildErrorResponse(
      request.id,
      'unknown',
      `Unexpected error: ${error instanceof Error ? error.message : String(error)}`,
      undefined,
      startTime
    );
  }
}

function buildErrorResponse(
  id: string,
  type: NonNullable<ExecutionResponse['error']>['type'],
  message: string,
  details: string | undefined,
  startTime: number
): ExecutionResponse {
  return {
    id,
    status: type === 'timeout' ? 'timeout' : 'error',
    output: `Error [${type}]: ${message}${details ? '\nDetails: ' + details : ''}`,
    stdout: '',
    stderr: '',
    buildOutput: '',
    metadata: {
      language: 'unknown',
      compiler: 'none',
      exitCode: -1,
      executionTime: Math.round(performance.now() - startTime),
      timedOut: type === 'timeout',
      outputTruncated: false,
    },
    error: { type, message, details },
  };
}

// ============================================================
// MESSAGE HANDLER
// ============================================================

const activeExecutions = new Map<string, GodboltClient>();

addEventListener('message', async ({ data }) => {
  try {
    // Validate request
    const request = validateRequest(data);
    
    // Track active execution for cancellation support
    const client = new GodboltClient();
    activeExecutions.set(request.id, client);
    
    // Send progress update
    postMessage({
      type: 'progress',
      id: request.id,
      __taskId: data.__taskId,
      stage: 'validating',
      message: 'Request validated, preparing execution...'
    });
    
    // Execute
    const result = await executeCode(request);
    
    // Send result
    postMessage({
      type: 'result',
      __taskId: data.__taskId,
      ...result
    });
    
  } catch (error) {
    // Handle validation errors that happen before executeCode
    const id = data?.id || 'unknown';
    const response = buildErrorResponse(
      id,
      'validation',
      error instanceof Error ? error.message : String(error),
      undefined,
      performance.now()
    );
    
    postMessage({
      type: 'result',
      __taskId: data.__taskId,
      ...response
    });
  } finally {
    if (data?.id) {
      activeExecutions.delete(data.id);
    }
  }
});

// Support for cancellation messages
addEventListener('message', ({ data }) => {
  if (data?.type === 'cancel' && data?.id) {
    const client = activeExecutions.get(data.id);
    if (client) {
      client.abort();
      activeExecutions.delete(data.id);
      postMessage({
        type: 'cancelled',
        id: data.id,
        message: 'Execution cancelled by user'
      });
    }
  }
});

// Health check handler
/*
addEventListener('message', ({ data }) => {
  if (data?.type === 'ping') {
    postMessage({
      type: 'pong',
      timestamp: Date.now(),
      supportedLanguages: Object.keys(COMPILER_MAP),
      cacheSize: resultCache['cache']?.size || 0, // Access private untuk debug
    });
  }
});
*/
