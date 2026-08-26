import assert from 'node:assert/strict';
import test from 'node:test';
import { AiStructuredInterpretationSchema, actionFromStructured, structuredFromAction, validateStructuredInterpretation, type AiStructuredInterpretation } from '../lib/assistant/ai-schema';
import { getAiRuntimeConfig } from '../lib/assistant/ai-config';
import { readAiObservations } from '../lib/assistant/ai-observability';
import { AiProviderError, OpenAIIntentProvider } from '../lib/assistant/ai-provider';
import { interpretOnServer } from '../lib/assistant/ai-runtime';
import { ConversationEngine } from '../lib/assistant/conversation-engine';
import { interpretCommand } from '../lib/assistant/interpreter';
import { OperationalMemoryRepository, type StorageLike } from '../lib/assistant/memory';
import { parseDate, combineDateTime, parseRelativeDateTime } from '../lib/assistant/parsing';
import type { ActionInterpreter, InterpretationContext } from '../lib/assistant/types';

class TestStorage implements StorageLike {
  private values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
}

const now = new Date(2026, 7, 19, 10, 0, 0);
const emptyContext: InterpretationContext = { turns: [], source: 'text' };

function expenseOutput(amount: number | null = 30): AiStructuredInterpretation {
  return structuredFromAction({
    id: 'expense-action', intent: 'create_expense', title: 'Gasto em combustível', summary: '', requiresConfirmation: false,
    data: { amount, currency: 'BRL', category: 'combustível', occurredAt: now.toISOString() },
  });
}

function fakeOpenAI(output: unknown, usage = { input_tokens: 120, output_tokens: 40, total_tokens: 160, input_tokens_details: { cached_tokens: 20 } }) {
  let captured: Record<string, unknown> | null = null;
  const provider = new OpenAIIntentProvider({
    model: 'gpt-5.4-mini', timeoutMs: 200,
    responses: { async parse(params: Record<string, unknown>) { captured = params; return { output_parsed: output, usage }; } },
  });
  return { provider, captured: () => captured };
}

test('Structured Output possui schema rígido e rejeita campos extras', () => {
  const valid = expenseOutput();
  assert.equal(validateStructuredInterpretation(valid).intent, 'create_expense');
  assert.equal(AiStructuredInterpretationSchema.safeParse({ ...valid, execute_now: true }).success, false);
  assert.equal(AiStructuredInterpretationSchema.safeParse({ ...valid, confidence: 1.4 }).success, false);
  assert.equal(AiStructuredInterpretationSchema.safeParse({ ...valid, entities: { ...valid.entities, amount: -10 } }).success, false);
});

test('provider OpenAI usa Responses API, json_schema estrito e nenhuma ferramenta', async () => {
  const fake = fakeOpenAI(expenseOutput());
  const result = await fake.provider.interpret({ text: 'Gastei 30 reais em combustível.', now, timezone: 'America/Cuiaba', context: emptyContext });
  assert.equal(result.interpretation.intent, 'create_expense');
  assert.equal(result.usage.totalTokens, 160);
  const request = fake.captured()!;
  assert.equal(request.model, 'gpt-5.4-mini');
  assert.equal('tools' in request, false);
  const format = (request.text as { format: { type: string; strict: boolean } }).format;
  assert.equal(format.type, 'json_schema');
  assert.equal(format.strict, true);
});

test('saída OpenAI validada vira ação, mas confirmação continua sendo da aplicação', () => {
  const structured = expenseOutput();
  structured.requires_confirmation = true;
  const action = actionFromStructured(structured, 'openai')!;
  assert.equal(action.intent, 'create_expense');
  assert.equal(action.requiresConfirmation, false);
  assert.equal(action.confidence, 1);
  assert.equal(action.interpretedBy, 'openai');
});

test('interpretação OpenAI passa pelo roteador e registra gasto', async () => {
  const repository = new OperationalMemoryRepository(new TestStorage());
  const fake = fakeOpenAI(expenseOutput(32.5));
  const config = { ...getAiRuntimeConfig({ OPENAI_API_KEY: 'test-only', AI_PROVIDER: 'openai' }), notice: 'OpenAI ativa.' };
  const interpreter: ActionInterpreter = {
    interpret: (text, context) => interpretOnServer({ text, now, timezone: 'America/Cuiaba', context }, { provider: fake.provider, config }),
  };
  const engine = new ConversationEngine(repository, undefined, interpreter);
  const result = await engine.process('Acabei de gastar R$ 32,50 no posto.', 'voice');
  assert.equal(result.kind, 'executed');
  assert.equal(result.provider, 'openai');
  assert.equal(repository.read().expenses[0].amount, 32.5);
  assert.ok(readAiObservations()[0].totalTokens > 0);
  assert.ok(readAiObservations()[0].estimatedCostUsd !== null);
});

test('gasto sem valor pergunta antes de executar', async () => {
  const repository = new OperationalMemoryRepository(new TestStorage());
  const missing = expenseOutput(null);
  missing.missing_fields = ['amount'];
  const interpreter: ActionInterpreter = { async interpret() { return { action: actionFromStructured(missing, 'openai'), provider: 'openai', notice: 'OpenAI ativa.' }; } };
  const engine = new ConversationEngine(repository, undefined, interpreter);
  const question = await engine.process('Anota um gasto em combustível.', 'voice');
  assert.equal(question.kind, 'question');
  assert.match(question.reply, /valor/);
  assert.equal(repository.read().expenses.length, 0);
  const completed = await engine.process('Foram R$ 32,50.', 'voice');
  assert.equal(completed.kind, 'executed');
  assert.equal(repository.read().expenses[0].amount, 32.5);
});

test('datas relativas usam a data atual no fuso do app (campos UTC = parede)', () => {
  const tz = 'America/Cuiaba';
  const ref = new Date('2026-08-19T13:00:00Z'); // 09:00 em Cuiabá (UTC-4), uma quarta-feira
  assert.equal(parseDate('depois de amanhã', ref, tz)?.getUTCDate(), 21);
  assert.equal(parseDate('sexta', ref, tz)?.getUTCDate(), 21);
  assert.equal(parseDate('segunda', ref, tz)?.getUTCDate(), 24);
  assert.equal(parseDate('semana que vem', ref, tz)?.getUTCDate(), 24);
  assert.equal(parseDate('mês que vem', ref, tz)?.getUTCMonth(), 8);
  assert.equal(parseDate('mês que vem', ref, tz)?.getUTCDate(), 1);
});

test('“hoje” à noite em Cuiabá não vira amanhã (bug de fuso corrigido)', () => {
  const tz = 'America/Cuiaba';
  // 2026-08-20T02:30:00Z = 22:30 do dia 19 em Cuiabá; "hoje" tem que ser o dia 19.
  const ref = new Date('2026-08-20T02:30:00Z');
  assert.equal(parseDate('hoje', ref, tz)?.getUTCDate(), 19);
  // "hoje às 23h" em Cuiabá (dia 19) = 2026-08-20T03:00:00Z, não 23h UTC.
  assert.equal(combineDateTime(parseDate('hoje', ref, tz)!, { hour: 23, minute: 0 }, tz), '2026-08-20T03:00:00.000Z');
});

test('dia da semana à noite não pula uma semana (domingo continua o próximo domingo real)', () => {
  const tz = 'America/Cuiaba';
  // 2026-08-23T02:00:00Z = 22:00 de sábado 22 em Cuiabá. "domingo" deve ser o dia 23.
  const ref = new Date('2026-08-23T02:00:00Z');
  assert.equal(parseDate('domingo', ref, tz)?.getUTCDate(), 23);
});

test('tempo relativo "daqui a N minutos/horas" e "em N min" resolve a partir de agora', () => {
  const ref = new Date('2026-08-20T03:00:00Z');
  assert.equal(parseRelativeDateTime('me lembra daqui a 2 minutos de tomar água', ref)?.toISOString(), '2026-08-20T03:02:00.000Z');
  assert.equal(parseRelativeDateTime('me lembra daqui a dois minutos', ref)?.toISOString(), '2026-08-20T03:02:00.000Z');
  assert.equal(parseRelativeDateTime('me lembra em 5 min', ref)?.toISOString(), '2026-08-20T03:05:00.000Z');
  assert.equal(parseRelativeDateTime('me lembra daqui a uma hora', ref)?.toISOString(), '2026-08-20T04:00:00.000Z');
  assert.equal(parseRelativeDateTime('me lembra em meia hora', ref)?.toISOString(), '2026-08-20T03:30:00.000Z');
  assert.equal(parseRelativeDateTime('me lembra hoje de pagar a conta', ref), null); // sem expressão relativa
});

test('lembrete "daqui a dois minutos" não vira 02:00 e limpa o título', () => {
  const ref = new Date('2026-08-20T03:00:00Z');
  const rem = interpretCommand('me lembra daqui a dois minutos de tomar água', ref, 'America/Cuiaba')!;
  assert.equal(rem.intent, 'create_reminder');
  assert.equal(rem.data.dueAt, '2026-08-20T03:02:00.000Z');
  assert.equal(rem.data.title, 'tomar água');
});

test('fallback local cobre as frases portuguesas novas', () => {
  const expense = interpretCommand('Acabei de gastar R$ 32,50 no posto.', now)!;
  assert.equal(expense.intent, 'create_expense');
  assert.equal(expense.data.amount, 32.5);
  assert.equal(expense.data.category, 'posto');

  const friday = interpretCommand('Me lembra sexta de cobrar o professor.', now)!;
  assert.equal(friday.intent, 'create_reminder');
  assert.equal(new Date(String(friday.data.dueAt)).getUTCDate(), 21);
  assert.equal(friday.data.title, 'cobrar o professor');

  assert.equal(interpretCommand('Quanto eu gastei com combustível este mês?', now)?.intent, 'read_expenses');
  assert.equal(interpretCommand('Quais são minhas tarefas de hoje?', now)?.data.range, 'today');
  assert.equal(interpretCommand('Quem estou esperando responder?', now)?.intent, 'search_memory');
  assert.equal(interpretCommand('Anota que preciso conversar com o professor de Designer.', now)?.intent, 'create_note');
  assert.equal(interpretCommand('Prepare uma mensagem para o João dizendo que amanhã tem aula.', now)?.intent, 'prepare_whatsapp_message');
  const groupMessage = interpretCommand('Mande no grupo dos pais dizendo que amanhã não tem aula.', now)!;
  assert.equal(groupMessage.intent, 'send_whatsapp_message');
  assert.equal(groupMessage.data.recipientName, 'grupo dos pais');
  assert.equal(groupMessage.data.body, 'amanhã não tem aula.');
  assert.equal(interpretCommand('Desfaz isso.', now)?.intent, 'undo_last_action');
});

test('"agende um lembrete" cria lembrete, não evento', () => {
  const now = new Date('2026-08-25T22:53:00.000Z');
  const reminder = interpretCommand('Agende um lembrete de designer gráfico para hoje às 19h', now, 'America/Cuiaba');
  assert.equal(reminder?.intent, 'create_reminder');
  assert.equal(reminder?.data.title, 'designer gráfico');
  assert.equal(reminder?.data.dueAt, '2026-08-25T23:00:00.000Z');
});

test('nomes duplicados continuam sendo resolvidos fora do modelo', async () => {
  const repository = new OperationalMemoryRepository(new TestStorage());
  repository.createContact('João', 'Professor de Designer');
  repository.createContact('João', 'Aluno de Fotografia');
  const reminder = structuredFromAction({ id: 'r', intent: 'create_reminder', title: 'falar com João', summary: '', requiresConfirmation: false, data: { title: 'falar com João', dueAt: new Date(2026, 7, 20, 9).toISOString(), contactName: 'João' } });
  const interpreter: ActionInterpreter = { async interpret() { return { action: actionFromStructured(reminder, 'openai'), provider: 'openai', notice: 'OpenAI ativa.' }; } };
  const result = await new ConversationEngine(repository, undefined, interpreter).process('Me lembra amanhã às nove de falar com João.', 'voice');
  assert.equal(result.kind, 'question');
  assert.match(result.reply, /Encontrei 2 pessoas/);
});

test('chave ausente ativa fallback local de forma explícita', () => {
  const config = getAiRuntimeConfig({ AI_PROVIDER: 'openai' });
  assert.equal(config.requestedProvider, 'openai');
  assert.equal(config.activeProvider, 'local');
  assert.equal(config.notice, 'Modo local ativo.');
  assert.equal(config.fallbackReason, 'missing_api_key');
  assert.equal(getAiRuntimeConfig({ OPENAI_API_KEY: 'test-only' }).activeProvider, 'openai');
  assert.equal(getAiRuntimeConfig({ AI_PROVIDER: 'local', OPENAI_API_KEY: 'test-only' }).activeProvider, 'local');
});

test('erro da API não aciona fallback silencioso', async () => {
  const provider = new OpenAIIntentProvider({ responses: { async parse() { throw new Error('network'); } }, timeoutMs: 100 });
  await assert.rejects(() => provider.interpret({ text: 'teste', now, timezone: 'America/Cuiaba', context: emptyContext }), (error: unknown) => error instanceof AiProviderError && error.code === 'api_error');
});

test('timeout da OpenAI interrompe a interpretação', async () => {
  const provider = new OpenAIIntentProvider({ responses: { async parse() { return await new Promise(() => undefined); } }, timeoutMs: 20 });
  await assert.rejects(() => provider.interpret({ text: 'teste', now, timezone: 'America/Cuiaba', context: emptyContext }), (error: unknown) => error instanceof AiProviderError && error.code === 'timeout');
});

test('resposta OpenAI inválida não gera ação', async () => {
  const provider = new OpenAIIntentProvider({ responses: { async parse() { return { output_parsed: { intent: 'create_expense' } }; } }, timeoutMs: 100 });
  await assert.rejects(() => provider.interpret({ text: 'teste', now, timezone: 'America/Cuiaba', context: emptyContext }), (error: unknown) => error instanceof AiProviderError && error.code === 'invalid_output');
});

test('configuração recusa provider desconhecido', () => {
  assert.throws(() => getAiRuntimeConfig({ AI_PROVIDER: 'automatico' }), /AI_PROVIDER/);
});
