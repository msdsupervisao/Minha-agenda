import type { AgentToolResult, JsonValue } from './contracts';

export type AgentClientResult = {
  kind: 'completed' | 'failed' | 'approval_required' | 'cancelled';
  reply: string;
  approvalId?: string;
  errorCode?: string;
  toolResults?: AgentToolResult[];
};

export async function sendAgentTurn(
  input: { text: string; source: 'voice' | 'text' } | { approvalId: string; decision: 'approve' | 'cancel' },
) {
  const response = await fetch('/api/agent/turn', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
  const payload = await safeJson(response);
  if (!response.ok) throw new Error(String(payload.error || 'Não foi possível concluir o turno do agente.'));
  return payload as unknown as AgentClientResult;
}

export function verifiedScheduleHandoff(result: AgentClientResult) {
  return result.toolResults
    ?.filter((toolResult) => toolResult.status === 'success' && toolResult.verified)
    .map((toolResult) => toolResult.output)
    .find((output): output is Record<string, JsonValue> => Boolean(
      output
      && typeof output === 'object'
      && !Array.isArray(output)
      && output.created === true
      && typeof output.handoffId === 'string',
    ));
}

function safeJson(response: Response): Promise<Record<string, unknown>> {
  return response.json().catch(() => ({})) as Promise<Record<string, unknown>>;
}
