import type { ActionInterpreter, AiProviderName, AssistantAction, InterpretationContext } from './types';

type FetchLike = typeof fetch;

export class BackendActionInterpreter implements ActionInterpreter {
  private request: FetchLike;
  constructor(request: FetchLike = fetch) {
    this.request = (...args) => request(...args);
  }

  async interpret(text: string, context: InterpretationContext) {
    const response = await this.request('/api/assistant/interpret', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text, source: context.source, context: context.turns.slice(-10) }),
    });
    const payload = await safeJson(response);
    if (!response.ok) throw new Error(typeof payload.error === 'string' ? payload.error : 'O cérebro da assistente não respondeu.');
    if (payload.provider !== 'openai' && payload.provider !== 'local') throw new Error('O backend retornou um provider inválido.');
    return {
      action: (payload.action || null) as AssistantAction | null,
      provider: payload.provider as AiProviderName,
      notice: typeof payload.notice === 'string' ? payload.notice : '',
      observationId: typeof payload.observationId === 'string' ? payload.observationId : undefined,
    };
  }
}

export async function getBackendAiStatus(request: FetchLike = fetch) {
  const response = await request('/api/assistant/status', { cache: 'no-store' });
  const payload = await safeJson(response);
  if (!response.ok) throw new Error('Não foi possível consultar o modo de IA.');
  return { provider: payload.provider as AiProviderName, notice: String(payload.notice || '') };
}

async function safeJson(response: Response): Promise<Record<string, unknown>> {
  try { return await response.json() as Record<string, unknown>; }
  catch { return {}; }
}
