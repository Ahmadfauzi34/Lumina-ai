export interface ToolParameter {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  description: string;
  required?: boolean;
  enum?: string[];
  items?: { type: string; properties?: Record<string, { type: string }> };
  default?: unknown;
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: ToolParameter[];
  routing?: {
    priority?: number;
    timeoutMs?: number;
    retryable?: boolean;
    maxRetries?: number;
    cacheable?: boolean;
    cacheTtlMs?: number;
  };
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface ToolResult {
  toolCallId: string;
  status: 'success' | 'error' | 'pending';
  output: string;
  metadata?: Record<string, unknown>;
  durationMs?: number;
}

export type ToolExecutor = (args: Record<string, unknown>) => Promise<Omit<ToolResult, 'toolCallId' | 'durationMs'>>;

export interface ToolRegistryEntry {
  definition: ToolDefinition;
  executor: ToolExecutor;
}
