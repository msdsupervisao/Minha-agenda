import assert from 'node:assert/strict';
import test from 'node:test';
import { runAgentPilot } from '../lib/agent/server-agent';
import { emptyAgentUsage } from '../lib/agent/contracts';
import type { AgentProvider, AgentProviderRequest, AgentProviderResponse } from '../lib/agent/contracts';
import type { ClassCatalog } from '../lib/agent/tools/classes';

const catalog: ClassCatalog = { async list() { return []; } };

class DraftingProvider implements AgentProvider {
  readonly name = 'test-provider';
  constructor(private readonly toolName: string, private readonly argumentsForTool: Record<string, string | number>) {}

  async generate(request: AgentProviderRequest): Promise<AgentProviderResponse> {
    const output = request.toolResults?.[0]?.output as { body?: string } | undefined;
    return {
      provider: this.name,
      model: 'test-model',
      text: output?.body || '',
      toolCalls: output ? [] : [{ callId: 'draft-1', name: this.toolName, arguments: this.argumentsForTool }],
      usage: emptyAgentUsage(),
    };
  }
}

test('Jarvis devolve um resumo de aula como rascunho, sem salvar nem enviar', async () => {
  const source = 'A aula abordou fotossíntese: plantas usam luz, água e gás carbônico para produzir glicose e oxigênio.';
  const result = await runAgentPilot({} as never, 'professor-1', `Resuma esta aula: ${source}`, 'text', 'America/Cuiaba', {
    env: { AI_PROVIDER: 'local' },
    provider: new DraftingProvider('draft_lesson_summary', { source }),
    catalog,
    conversation: [],
    educationDraft: async () => ({ body: '## Fotossíntese\nAs plantas usam luz, água e gás carbônico para produzir glicose e oxigênio.' }),
  });

  assert.equal(result.kind, 'completed');
  if (result.kind !== 'completed') return;
  assert.match(result.reply, /## Fotossíntese/);
  assert.equal(result.toolResults[0]?.status, 'success');
  assert.equal(result.toolResults[0]?.risk, 'read');
  assert.equal(result.toolResults[0]?.output && (result.toolResults[0].output as { draft?: boolean }).draft, true);
});

test('Jarvis devolve questões de Kahoot com quatro alternativas e gabarito', async () => {
  const source = 'Fotossíntese usa luz, água e gás carbônico para produzir glicose e oxigênio.';
  const result = await runAgentPilot({} as never, 'professor-1', `Crie uma questão para Kahoot: ${source}`, 'text', 'America/Cuiaba', {
    env: { AI_PROVIDER: 'local' },
    provider: new DraftingProvider('draft_kahoot_quiz', { source, count: 1 }),
    catalog,
    conversation: [],
    educationDraft: async () => ({ questions: [{
      prompt: 'O que as plantas produzem na fotossíntese?',
      options: ['Glicose e oxigênio', 'Água e luz', 'Som e calor', 'Apenas água'],
      correctIndex: 0,
    }] }),
  });

  assert.equal(result.kind, 'completed');
  if (result.kind !== 'completed') return;
  assert.match(result.reply, /O que as plantas produzem na fotossíntese\?/);
  assert.match(result.reply, /A\) Glicose e oxigênio/);
  assert.match(result.reply, /D\) Apenas água/);
  assert.match(result.reply, /Gabarito: A/);
  assert.equal(result.toolResults[0]?.status, 'success');
  assert.equal(result.toolResults[0]?.risk, 'read');
});
