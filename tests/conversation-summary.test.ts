import assert from 'node:assert/strict';
import test from 'node:test';
import type { SupabaseClient } from '@supabase/supabase-js';
import { persistAgentTurn, parseStoredAgentContext, updateRollingSummary } from '../lib/agent/context-builder';
import type { ConversationSummarizer } from '../lib/agent/conversation-summarizer';

function storage(count: number, textLength = 10) {
  let row = {
    recent_turns: Array.from({ length: count }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', text: `${i}: ${'x'.repeat(textLength)}` })),
    summary: 'Resumo anterior', focus: { id: 'turma' },
    operational_memory: {}, long_term_memory: [{ fact: 'Memória explícita' }],
  };
  const writes: Record<string, unknown>[] = [];
  const faults = { read: false, write: false, missing: false };
  const client = { from: (table: string) => {
    assert.equal(table, 'agent_contexts');
    return {
      select: () => ({ eq: (_key: string, userId: string) => {
        assert.equal(userId, 'user');
        const query = {
          abortSignal: () => query,
          maybeSingle: async () => ({ data: faults.missing ? null : row, error: faults.read ? new Error('read') : null }),
        };
        return query;
      } }),
      upsert: async (value: Partial<typeof row>) => { writes.push(value); row = { ...row, ...value }; return { error: null }; },
      update: (value: Partial<typeof row>) => ({ eq: (_key: string, userId: string) => {
        assert.equal(userId, 'user');
        return { abortSignal: async () => {
          if (faults.write) return { error: new Error('write') };
          writes.push(value); row = { ...row, ...value }; return { error: null };
        } };
      } }),
    };
  } } as unknown as SupabaseClient;
  return { client, read: () => row, writes, faults, setSummary: (summary: string) => { row = { ...row, summary }; } };
}
const input = { userText: 'Nova pergunta', result: { reply: 'Nova resposta', toolResults: [] } };
const retired = [{ role: 'user' as const, content: 'Fato antigo' }];

test('persistência retorna aposentadas sem resumir e retém 50 falas acima do orçamento', async () => {
  const db = storage(50, 1000);
  const original = db.read();
  assert.ok(parseStoredAgentContext(original).conversation.length < 50);
  const { retiredTurns } = await persistAgentTurn(db.client, 'user', input);
  assert.deepEqual(retiredTurns.map(t => t.content), original.recent_turns.slice(0, 2).map(t => t.text));
  assert.equal(db.read().summary, original.summary);
  assert.equal(Object.hasOwn(db.writes[0], 'summary'), false);
  assert.equal(db.read().recent_turns.length, 50);
  assert.deepEqual(db.read().recent_turns.slice(0, 48), original.recent_turns.slice(2));
  assert.deepEqual(db.read().long_term_memory, original.long_term_memory);
  assert.deepEqual(db.read().focus, original.focus);
});

test('até 50 falas não há trabalho de resumo', async () => {
  const db = storage(48);
  const { retiredTurns } = await persistAgentTurn(db.client, 'user', input);
  let calls = 0;
  await updateRollingSummary(db.client, 'user', retiredTurns, async () => { calls++; return 'indevido'; });
  assert.equal(calls, 0);
  assert.equal(db.read().recent_turns.length, 50);
  assert.equal(db.writes.length, 1);
});

test('background relê o resumo atual e grava somente resumo e data', async () => {
  const db = storage(50);
  const { retiredTurns } = await persistAgentTurn(db.client, 'user', input);
  db.setSummary('Resumo de outro turno concluído');
  let receivedSummary: string | null = null;
  let receivedTurns: unknown;
  await updateRollingSummary(db.client, 'user', retiredTurns, async (summary, turns) => {
    receivedSummary = summary;
    receivedTurns = turns;
    return 'Resumo atualizado';
  });
  assert.equal(receivedSummary, 'Resumo de outro turno concluído');
  assert.deepEqual(receivedTurns, retiredTurns);
  assert.equal(db.read().summary, 'Resumo atualizado');
  assert.deepEqual(Object.keys(db.writes[1]).sort(), ['summary', 'updated_at']);
});

test('resumidor pendente não impede novos turnos e não sobrescreve histórico recente', async () => {
  const db = storage(50);
  const first = await persistAgentTurn(db.client, 'user', input);
  let finish!: (summary: string) => void;
  let started!: () => void;
  const ready = new Promise<void>(resolve => { started = resolve; });
  const pending = updateRollingSummary(db.client, 'user', first.retiredTurns, async () => {
    started();
    return new Promise<string>(resolve => { finish = resolve; });
  });
  await ready;
  await persistAgentTurn(db.client, 'user', { ...input, userText: 'Pergunta seguinte' });
  const recent = db.read().recent_turns;
  finish('Concluído após o turno seguinte');
  await pending;
  assert.deepEqual(db.read().recent_turns, recent);
  assert.equal(db.read().summary, 'Concluído após o turno seguinte');
});

for (const mode of ['absent', 'failure', 'empty', 'timeout', 'read', 'write', 'missing'] as const) {
  test(`falha ou ausência do resumo não altera contexto: ${mode}`, async () => {
    const db = storage(50);
    const before = db.read();
    let signal: AbortSignal | undefined;
    if (mode === 'read' || mode === 'write' || mode === 'missing') db.faults[mode] = true;
    const summarizer: ConversationSummarizer | undefined = mode === 'absent' ? undefined : async (_summary, _turns, receivedSignal) => {
      if (mode === 'failure') throw new Error('offline');
      if (mode === 'empty') return '  ';
      if (mode !== 'timeout') return 'Novo resumo';
      signal = receivedSignal;
      return new Promise<string>(() => {});
    };
    await updateRollingSummary(db.client, 'user', retired, summarizer, 10);
    assert.deepEqual(db.read(), before);
    assert.equal(db.writes.length, 0);
    if (mode === 'timeout') assert.equal(signal?.aborted, true);
  });
}

test('resultado tardio após timeout não grava resumo', async () => {
  const db = storage(50);
  let finish!: (summary: string) => void;
  await updateRollingSummary(db.client, 'user', retired, async () => new Promise<string>(resolve => { finish = resolve; }), 10);
  finish('Tarde demais');
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(db.writes.length, 0);
});

test('limita o resumo a 1500 caracteres', async () => {
  const db = storage(50);
  await updateRollingSummary(db.client, 'user', retired, async () => 'a'.repeat(2000));
  assert.equal(db.read().summary.length, 1500);
});
