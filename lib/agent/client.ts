import type { AgentToolResult, JsonValue, AgentProgress, AgentModelExecution } from './contracts';

export type AgentClientResult = {
  kind: 'completed' | 'failed' | 'approval_required' | 'cancelled';
  reply: string;
  approvalId?: string;
  errorCode?: string;
  toolResults?: AgentToolResult[];
  executions?: AgentModelExecution[];
  runId?: string;
  verified?: boolean;
};

export async function sendAgentTurn(
  input: { text: string; source: 'voice' | 'text' } | { approvalId: string; decision: 'approve' | 'cancel' },
  onProgress?: (event: AgentProgress) => void,
  request: typeof fetch = fetch,
) {
  const response = await request('/api/agent/turn', {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: onProgress ? 'application/x-ndjson' : 'application/json' },
    body: JSON.stringify(input),
  });
  if (response.headers.get('content-type')?.includes('application/x-ndjson') && response.body) {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    try {
      while (true) {
        const { done, value } = await reader.read();
        buffer += decoder.decode(value, { stream: !done });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
          if (!line.trim()) continue;
          const event = JSON.parse(line);
          if (event.type === 'progress') onProgress?.(event.progress);
          if (event.type === 'result') {
            if (event.httpStatus >= 400) throw new Error(event.result.error || 'Não foi possível concluir o pedido.');
            return event.result as AgentClientResult;
          }
        }
        if (done) throw new Error('A conexão foi interrompida antes da confirmação do resultado.');
      }
    } finally { reader.releaseLock(); }
  }
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
