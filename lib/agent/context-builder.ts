import type { SupabaseClient } from '@supabase/supabase-js';
import type { AgentContextState, AgentMessage, AgentRunResult, AgentToolResult, JsonObject, JsonValue } from './contracts';
import { emptyAgentContextState } from './contracts';

export const DEFAULT_CONTEXT_TOKEN_BUDGET = 3_000;

export type LoadedAgentContext = {
  conversation: AgentMessage[];
  state: AgentContextState;
};

export async function loadAgentContext(client: SupabaseClient, userId: string): Promise<LoadedAgentContext> {
  const [agentResult, legacyResult] = await Promise.all([
    client.from('agent_contexts')
      .select('recent_turns,summary,focus,operational_memory,long_term_memory')
      .eq('user_id', userId)
      .maybeSingle(),
    client.from('assistant_context')
      .select('recent_conversation,pending_question,last_prepared_message_id,last_entity_type,last_entity_id,last_action_log_id')
      .eq('user_id', userId)
      .maybeSingle(),
  ]);
  if (agentResult.error || legacyResult.error) throw new Error('load:agent_context');
  const legacy = parseAgentContextRow(legacyResult.data);
  return agentResult.data ? parseStoredAgentContext(agentResult.data, legacy) : legacy;
}

export async function loadAgentConversation(client: SupabaseClient, userId: string): Promise<AgentMessage[]> {
  return (await loadAgentContext(client, userId)).conversation;
}

export function parseAgentConversation(value: unknown, maxTokens = DEFAULT_CONTEXT_TOKEN_BUDGET): AgentMessage[] {
  if (!Array.isArray(value)) return [];
  const messages = value.flatMap<AgentMessage>((turn) => {
    if (!turn || typeof turn !== 'object') return [];
    const candidate = turn as Record<string, unknown>;
    if ((candidate.role !== 'user' && candidate.role !== 'assistant') || typeof candidate.text !== 'string') return [];
    const content = candidate.text.trim();
    return content ? [{ role: candidate.role as AgentMessage['role'], content }] : [];
  }).slice(-50);
  return selectConversationWindow(messages, maxTokens);
}

export function selectConversationWindow(messages: readonly AgentMessage[], maxTokens = DEFAULT_CONTEXT_TOKEN_BUDGET) {
  const budget = Math.max(1, maxTokens);
  const selected: AgentMessage[] = [];
  let estimatedTokens = 0;

  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    const messageTokens = estimateMessageTokens(message);
    if (selected.length > 0 && estimatedTokens + messageTokens > budget) break;
    selected.unshift(message);
    estimatedTokens += messageTokens;
  }
  return selected;
}

export function parseAgentContextRow(value: unknown): LoadedAgentContext {
  if (!value || typeof value !== 'object') {
    return { conversation: [], state: emptyAgentContextState() };
  }
  const row = value as Record<string, unknown>;
  const focus = compactJsonObject({
    entityType: jsonScalar(row.last_entity_type),
    entityId: jsonScalar(row.last_entity_id),
  });
  const operationalMemory = compactJsonObject({
    pendingQuestion: optionalJsonValue(row.pending_question),
    lastPreparedMessageId: jsonScalar(row.last_prepared_message_id),
    lastActionLogId: jsonScalar(row.last_action_log_id),
  });
  return {
    conversation: parseAgentConversation(row.recent_conversation),
    state: {
      summary: null,
      focus: Object.keys(focus).length > 0 ? focus : null,
      operationalMemory,
      longTermMemory: [],
    },
  };
}

export function parseStoredAgentContext(value: unknown, fallback?: LoadedAgentContext): LoadedAgentContext {
  if (!value || typeof value !== 'object') return fallback || { conversation: [], state: emptyAgentContextState() };
  const row = value as Record<string, unknown>;
  const focus = jsonValue(row.focus);
  const operationalMemory = jsonValue(row.operational_memory);
  const longTermMemory = jsonValue(row.long_term_memory);
  return {
    conversation: parseAgentConversation(row.recent_turns),
    state: {
      summary: typeof row.summary === 'string' && row.summary.trim() ? row.summary.trim() : fallback?.state.summary || null,
      focus: isJsonObject(focus) ? focus : fallback?.state.focus || null,
      operationalMemory: isJsonObject(operationalMemory) ? operationalMemory : fallback?.state.operationalMemory || {},
      longTermMemory: Array.isArray(longTermMemory) && longTermMemory.every(isJsonObject)
        ? longTermMemory
        : fallback?.state.longTermMemory || [],
    },
  };
}

export async function persistAgentTurn(
  client: SupabaseClient,
  userId: string,
  input: { userText: string; result: Pick<AgentRunResult, 'reply' | 'toolResults'>; now?: Date },
) {
  const { data, error } = await client.from('agent_contexts')
    .select('recent_turns,summary,focus,operational_memory,long_term_memory')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw new Error('load:agent_context_for_persist');
  const current = parseStoredAgentContext(data);
  const now = input.now || new Date();
  const next = evolveAgentContext(current, { ...input, now });

  const { error: persistError } = await client.from('agent_contexts').upsert({
    user_id: userId,
    recent_turns: next.conversation.map((message) => ({ role: message.role, text: message.content })),
    summary: next.state.summary,
    focus: next.state.focus,
    operational_memory: next.state.operationalMemory,
    long_term_memory: next.state.longTermMemory,
    updated_at: now.toISOString(),
  }, { onConflict: 'user_id' });
  if (persistError) throw new Error('persist:agent_context');
}

export function evolveAgentContext(
  current: LoadedAgentContext,
  input: { userText: string; result: Pick<AgentRunResult, 'reply' | 'toolResults'>; now: Date },
): LoadedAgentContext {
  const now = input.now;
  const observations = input.result.toolResults
    .filter((result) => result.status !== 'approval_required')
    .map((result) => observationFromResult(result, now));
  const previousObservations = Array.isArray(current.state.operationalMemory.observations)
    ? current.state.operationalMemory.observations
    : [];
  const focus = focusFromResults(input.result.toolResults) || current.state.focus;
  const recentTurns = [
    ...current.conversation,
    { role: 'user' as const, content: input.userText.trim() },
    { role: 'assistant' as const, content: input.result.reply.trim() },
  ].filter((message) => message.content).slice(-50);

  return {
    conversation: recentTurns,
    state: {
      ...current.state,
      focus,
      operationalMemory: {
        ...current.state.operationalMemory,
        observations: [...previousObservations, ...observations].slice(-20),
      },
    },
  };
}

function estimateMessageTokens(message: AgentMessage) {
  return Math.max(1, Math.ceil(message.content.length / 4)) + 4;
}

function compactJsonObject(value: Record<string, JsonValue | undefined>): JsonObject {
  return Object.fromEntries(Object.entries(value).filter((entry): entry is [string, JsonValue] => entry[1] !== undefined));
}

function jsonScalar(value: unknown): JsonValue | undefined {
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
    ? value
    : undefined;
}

function optionalJsonValue(value: unknown): JsonValue | undefined {
  return value === null || value === undefined ? undefined : jsonValue(value);
}

function jsonValue(value: unknown): JsonValue | undefined {
  if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
  if (Array.isArray(value)) {
    const items = value.map(jsonValue);
    return items.every((item) => item !== undefined) ? items as JsonValue[] : undefined;
  }
  if (value && typeof value === 'object') {
    const entries = Object.entries(value).map(([key, item]) => [key, jsonValue(item)] as const);
    if (entries.some(([, item]) => item === undefined)) return undefined;
    return Object.fromEntries(entries) as JsonObject;
  }
  return undefined;
}

function observationFromResult(result: AgentToolResult, now: Date): JsonObject {
  return {
    tool: result.toolName,
    args: redactSecrets(result.arguments),
    result: redactSecrets(result.output),
    success: result.status === 'success',
    verified: result.verified,
    evidence: redactSecrets(result.evidence ?? null),
    observedAt: now.toISOString(),
  };
}

function focusFromResults(results: AgentToolResult[]): JsonObject | null {
  for (const result of [...results].reverse()) {
    if (result.toolName !== 'find_classes' || result.status !== 'success' || !result.verified || !isJsonObject(result.output)) continue;
    if (result.output.resolution !== 'likely_single' || !Array.isArray(result.output.matches)) continue;
    const match = result.output.matches[0];
    if (!isJsonObject(match) || typeof match.id !== 'string' || typeof match.name !== 'string') continue;
    return { kind: 'class', id: match.id, label: match.name, confidence: typeof match.score === 'number' ? match.score : 1 };
  }
  return null;
}

function redactSecrets(value: JsonValue): JsonValue {
  if (Array.isArray(value)) return value.map(redactSecrets);
  if (!isJsonObject(value)) return value;
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [
    key,
    /^(?:code|deepLink|androidIntent|accessToken|secret)$/i.test(key) ? '[redacted]' : redactSecrets(item),
  ]));
}

function isJsonObject(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
