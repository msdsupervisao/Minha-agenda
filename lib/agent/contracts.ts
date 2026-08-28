import type { z } from 'zod';
import type { Source } from '@/lib/assistant/types';

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };
export type JsonObject = { [key: string]: JsonValue };

export type ToolRisk = 'read' | 'low' | 'external' | 'destructive' | 'critical';

export type AgentMessage = {
  role: 'user' | 'assistant';
  content: string;
};

export type AgentContextState = {
  summary: string | null;
  focus: JsonObject | null;
  operationalMemory: JsonObject;
  longTermMemory: JsonObject[];
};

export type AgentExecutionContext = {
  userId: string;
  source: Source;
  now: Date;
  timezone: string;
  state: AgentContextState;
  metadata?: JsonObject;
};

export type AgentToolCall = {
  callId: string;
  name: string;
  arguments: JsonObject;
};

export type AgentToolDescriptor = {
  name: string;
  description: string;
  parameters: JsonObject;
};

export type ToolVerification = {
  verified: boolean;
  evidence?: JsonValue;
};

export type AgentToolResult = {
  callId: string;
  toolName: string;
  arguments: JsonObject;
  status: 'success' | 'error' | 'approval_required' | 'denied';
  output: JsonValue;
  verified: boolean;
  risk: ToolRisk;
  errorCode?: string;
  approvalMessage?: string;
  evidence?: JsonValue;
};

export type AgentTool<TInput extends JsonObject = JsonObject> = {
  name: string;
  description: string;
  risk: ToolRisk | ((input: TInput, context: AgentExecutionContext) => ToolRisk);
  inputSchema: z.ZodType<TInput>;
  execute(input: TInput, context: AgentExecutionContext): Promise<JsonValue>;
  verify?(
    output: JsonValue,
    input: TInput,
    context: AgentExecutionContext,
  ): Promise<ToolVerification>;
  approvalMessage?(input: TInput, context: AgentExecutionContext): string;
};

export type AgentTokenUsage = {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  cachedInputTokens: number;
};

export type AgentProviderDiagnostic = {
  status?: number;
  code?: string;
  type?: string;
  param?: string;
};

export type AgentProviderRequest = {
  instructions: string;
  messages: AgentMessage[];
  tools: AgentToolDescriptor[];
  toolResults?: AgentToolResult[];
  continuation?: unknown;
};

export type AgentProviderResponse = {
  provider: string;
  model: string | null;
  text: string;
  toolCalls: AgentToolCall[];
  continuation?: unknown;
  usage: AgentTokenUsage;
};

export interface AgentProvider {
  readonly name: string;
  generate(request: AgentProviderRequest): Promise<AgentProviderResponse>;
}

export type AgentRunInput = {
  text: string;
  conversation?: AgentMessage[];
  context: AgentExecutionContext;
  approvedCallIds?: string[];
  resume?: {
    pendingCalls: AgentToolCall[];
    continuation: unknown;
  };
};

type AgentRunBase = {
  provider: string;
  model: string | null;
  steps: number;
  toolResults: AgentToolResult[];
  usage: AgentTokenUsage;
};

export type AgentRunResult = AgentRunBase & (
  | { kind: 'completed'; reply: string; verified: boolean }
  | {
      kind: 'approval_required';
      reply: string;
      pendingApprovals: AgentToolResult[];
      pendingCalls: AgentToolCall[];
      continuation: unknown;
    }
  | { kind: 'failed'; reply: string; errorCode: string; providerDiagnostic?: AgentProviderDiagnostic }
);

export function emptyAgentUsage(): AgentTokenUsage {
  return { inputTokens: 0, outputTokens: 0, totalTokens: 0, cachedInputTokens: 0 };
}

export function emptyAgentContextState(): AgentContextState {
  return { summary: null, focus: null, operationalMemory: {}, longTermMemory: [] };
}
