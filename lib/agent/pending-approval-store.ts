import type { SupabaseClient } from '@supabase/supabase-js';
import type { Source } from '@/lib/assistant/types';
import type { AgentToolCall, JsonValue } from './contracts';

export const AGENT_APPROVAL_TTL_MS = 15 * 60 * 1000;

export type PendingAgentApproval = {
  id: string;
  userId: string;
  provider: string;
  toolCalls: AgentToolCall[];
  continuation: unknown;
  source: Source;
  timezone: string;
  expiresAt: string;
};

export class SupabasePendingApprovalStore {
  constructor(private readonly client: SupabaseClient) {}

  async create(input: Omit<PendingAgentApproval, 'id' | 'expiresAt'>, now = new Date()) {
    const expiresAt = new Date(now.getTime() + AGENT_APPROVAL_TTL_MS).toISOString();
    const { data, error } = await this.client.from('agent_pending_approvals').insert({
      user_id: input.userId,
      provider: input.provider,
      tool_calls: ensureJson(input.toolCalls),
      continuation: ensureJson(input.continuation),
      source: input.source,
      timezone: input.timezone,
      status: 'pending',
      expires_at: expiresAt,
      updated_at: now.toISOString(),
    }).select('id').single();
    if (error) throw new Error('agent_approval_create_failed');
    return { id: String(data.id), expiresAt };
  }

  async claim(id: string, userId: string, now = new Date()): Promise<PendingAgentApproval | null> {
    const { data, error } = await this.client.from('agent_pending_approvals')
      .update({ status: 'processing', updated_at: now.toISOString() })
      .eq('id', id)
      .eq('user_id', userId)
      .eq('status', 'pending')
      .gt('expires_at', now.toISOString())
      .select('id,user_id,provider,tool_calls,continuation,source,timezone,expires_at')
      .maybeSingle();
    if (error) throw new Error('agent_approval_claim_failed');
    if (!data) return null;
    const toolCalls = parseToolCalls(data.tool_calls);
    if (!toolCalls) throw new Error('agent_approval_corrupted');
    return {
      id: String(data.id),
      userId: String(data.user_id),
      provider: String(data.provider),
      toolCalls,
      continuation: data.continuation,
      source: data.source === 'voice' ? 'voice' : 'text',
      timezone: String(data.timezone),
      expiresAt: String(data.expires_at),
    };
  }

  async finish(id: string, userId: string, status: 'consumed' | 'cancelled' | 'failed') {
    const { error } = await this.client.from('agent_pending_approvals')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('user_id', userId)
      .in('status', ['pending', 'processing']);
    if (error) throw new Error('agent_approval_finish_failed');
  }
}

function ensureJson(value: unknown): JsonValue {
  const serialized = JSON.stringify(value);
  if (serialized === undefined) throw new Error('agent_approval_not_serializable');
  return JSON.parse(serialized) as JsonValue;
}

function parseToolCalls(value: unknown): AgentToolCall[] | null {
  if (!Array.isArray(value)) return null;
  const calls: AgentToolCall[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object') return null;
    const call = item as Record<string, unknown>;
    if (typeof call.callId !== 'string' || typeof call.name !== 'string' || !isObject(call.arguments)) return null;
    calls.push({ callId: call.callId, name: call.name, arguments: call.arguments as AgentToolCall['arguments'] });
  }
  return calls;
}

function isObject(value: unknown) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
