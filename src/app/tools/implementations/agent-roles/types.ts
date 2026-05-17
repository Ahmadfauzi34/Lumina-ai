export interface AgentRoleDefinition {
  id: string;
  domain: string;
  specialization: string;
  owns: string[];
  excludes: string[];
  required_context: string[];
  output_schema: string;
  dynamic_invention?: boolean;
}

export interface RoleValidationResult {
  valid: boolean;
  resolvedRole: AgentRoleDefinition;
  warnings: string[];
  missingContext: string[];
  suggestedAction: 'PROCEED' | 'ABORT' | 'HANDOFF';
}

export interface BatchTaskItem {
  name: string;
  role: string;
  prompt: string;
  context?: Record<string, unknown>;
}

export interface BatchDispatchRequest {
  taskId: string;
  taskDescription: string;
  tasks: BatchTaskItem[];
}

export interface EnrichedPrompt {
  systemInstruction: string;
  userPrompt: string;
  warnings: string[];
}

export const AGENT_STATUS_PREFIXES = {
  OUT_OF_SCOPE: 'OUT_OF_SCOPE',
  INSUFFICIENT_CONTEXT: 'INSUFFICIENT_CONTEXT',
} as const;

