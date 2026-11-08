import type { AgentProvider, AgentProviderRequest, AgentProviderResponse, JsonObject } from '../lib/agent/contracts';
import { emptyAgentUsage } from '../lib/agent/contracts';

/** Somente para o teste com usuário e dados descartáveis. */
export class FakeBridgeTestProvider implements AgentProvider {
  readonly name = 'fake-bridge-test';

  async generate(request: AgentProviderRequest): Promise<AgentProviderResponse> {
    const previous = request.toolResults?.at(-1);
    if (previous && (previous.status !== 'success' || !previous.verified)) throw new Error('Ferramenta fictícia não verificada.');
    if (!previous) {
      const text = request.messages.at(-1)?.content || '';
      if (/combust/i.test(text)) return this.call('create_expense', { amount: 60, category: 'combustível' });
      if (/lembre/i.test(text)) return this.call('create_reminder', { title: 'Ligar para Ana', scheduleKind: 'delay_minutes', delayMinutes: 30, localDueAt: null });
      return this.call('find_classes', { query: 'Design Quarta Teste' });
    }
    if (previous.toolName === 'find_classes') {
      const output = previous.output as { matches?: Array<{ id?: string }> };
      const classId = output.matches?.[0]?.id;
      if (!classId) throw new Error('Turma fictícia não encontrada.');
      return this.call('compose_notice', { classId, topic: 'A aula será quarta às 19h.', styleHint: null, baseMessage: null });
    }
    if (previous.toolName === 'compose_notice') {
      const output = previous.output as { class?: { id?: string }; recipient?: string; body?: string };
      if (!output.class?.id || !output.recipient || !output.body) throw new Error('Aviso fictício inválido.');
      return this.call('prepare_notice_schedule', { classId: output.class.id, bodySource: 'composed', modelNumber: null, recipientName: output.recipient, body: output.body, scheduleKind: 'delay_minutes', localDueAt: null, delayMinutes: 10 });
    }
    return this.response('Ação fictícia conferida.', []);
  }

  private call(name: string, args: JsonObject): AgentProviderResponse {
    return this.response('', [{ callId: `fake-${name}`, name, arguments: args }]);
  }

  private response(text: string, toolCalls: AgentProviderResponse['toolCalls']): AgentProviderResponse {
    return { provider: this.name, model: 'fake', text, toolCalls, continuation: { kind: 'fake' }, usage: emptyAgentUsage() };
  }
}
