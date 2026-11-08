import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import { z } from 'zod';
import { BridgeQueue } from '../lib/agent/bridge-queue';
import { processNextBridgeJob } from '../lib/agent/bridge-worker';
import { AgentOrchestrator } from '../lib/agent/orchestrator';
import { emptyAgentContextState, emptyAgentUsage, type AgentExecutionContext, type AgentProvider, type AgentProviderResponse } from '../lib/agent/contracts';
import { ToolRegistry } from '../lib/agent/tool-registry';
import { StructuredTextAgentProvider } from '../lib/agent/providers/structured-text';
import { createPersonalAgendaTools } from '../lib/agent/tools/personal-agenda';
import type { PersonalAgendaStore, SavedExpense } from '../lib/data/agent-personal-repository';

test('pedido percorre SQL, worker e agente; aprovação executa somente após decisão', async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon nologin;
      create role authenticated nologin;
      create schema auth;
      create table auth.users (id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      grant usage on schema auth to authenticated, anon;
      insert into auth.users values ('11111111-1111-4111-8111-111111111111');
    `);
    await db.exec(await readFile('supabase/migrations/20261106000100_agent_bridge_jobs.sql', 'utf8'));
    await db.exec("set role authenticated; select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',false)");
    const client = { async rpc(name: string, args?: Record<string, unknown>) {
      try {
        if (name === 'agent_bridge_enqueue') return { data: (await db.query<{ id: string }>('select public.agent_bridge_enqueue($1::uuid,$2::jsonb) as id', [args?.p_request_id, JSON.stringify(args?.p_input)])).rows[0].id, error: null };
        if (name === 'agent_bridge_claim') return { data: (await db.query('select * from public.agent_bridge_claim()')).rows, error: null };
        if (name === 'agent_bridge_finish') return { data: (await db.query<{ ok: boolean }>('select public.agent_bridge_finish($1::uuid,$2::uuid,$3::text,$4::jsonb) as ok', [args?.p_id, args?.p_claim_token, args?.p_status, JSON.stringify(args?.p_result)])).rows[0].ok, error: null };
        if (name === 'agent_bridge_decide') return { data: (await db.query<{ ok: boolean }>('select public.agent_bridge_decide($1::uuid,$2::text) as ok', [args?.p_id, args?.p_decision])).rows[0].ok, error: null };
        throw new Error('unexpected RPC');
      } catch (error) { return { data: null, error }; }
    } };
    const queue = new BridgeQueue(client as never);
    let effects = 0;
    const registry = new ToolRegistry([{
      name: 'prepare_notice', description: 'Prepara um aviso', risk: 'external',
      inputSchema: z.object({ body: z.string() }).strict(),
      async execute(input) { effects++; return { body: input.body, status: 'awaiting_device' }; },
      async verify(output) { return { verified: true, evidence: output }; },
    }]);
    const call = { callId: 'call-1', name: 'prepare_notice', arguments: { body: 'Aviso fictício' } };
    const response = (text: string, calls: typeof call[]): AgentProviderResponse => ({ provider: 'fake', model: 'fake', text, toolCalls: calls, continuation: { kind: 'fake' }, usage: emptyAgentUsage() });
    let steps = 0;
    const provider: AgentProvider = { name: 'fake', async generate() { steps++; return steps === 1 ? response('', [call]) : response('Aviso preparado; confirme no celular.', []); } };
    const context: AgentExecutionContext = { userId: '11111111-1111-4111-8111-111111111111', source: 'voice', timezone: 'America/Cuiaba', now: new Date('2026-11-06T14:00:00Z'), state: emptyAgentContextState() };
    const runner = new AgentOrchestrator(provider, registry);
    const requestId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const input = { text: 'Agende um aviso', source: 'voice' as const, timezone: context.timezone };
    const id = await queue.enqueue(requestId, input);
    assert.equal(await queue.enqueue(requestId, input), id);
    await processNextBridgeJob(queue, (value, resume) => runner.run({ text: value.text, context, resume }));
    const pending = (await db.query<{ status: string; result: { kind: string } }>('select status,result from public.agent_bridge_jobs where id=$1', [id])).rows[0];
    assert.equal(pending.status, 'approval_required');
    assert.equal(pending.result.kind, 'approval_required');
    assert.equal(effects, 0);
    await queue.decide(id, 'approve');
    await assert.rejects(queue.decide(id, 'approve'), /bridge_decision_not_pending/);
    await processNextBridgeJob(queue, (value, resume) => runner.run({ text: value.text, context, resume }));
    const done = (await db.query<{ status: string; result: { kind: string } }>('select status,result from public.agent_bridge_jobs where id=$1', [id])).rows[0];
    assert.equal(done.status, 'completed');
    assert.equal(done.result.kind, 'completed');
    assert.equal(effects, 1);
    assert.equal(await processNextBridgeJob(queue, () => { throw new Error('não deve executar'); }), false);

    let expense: SavedExpense | null = null;
    let expenseWrites = 0;
    const personalStore: PersonalAgendaStore = {
      async agenda() { return { items: [], possiblyTruncated: false }; }, async contacts() { return []; },
      async createNote() { throw new Error('unexpected'); }, async getNote() { return null; },
      async createReminder() { throw new Error('unexpected'); }, async getReminder() { return null; },
      async createExpense(_userId, data) { expenseWrites++; expense = { id: 'saved-expense', ...data }; return expense.id; },
      async getExpense() { return expense; },
    };
    let modelStep = 0;
    const model = new StructuredTextAgentProvider({ model: 'fake', async generateText() {
      modelStep++;
      return JSON.stringify(modelStep === 1
        ? { text: '', toolCalls: [{ name: 'create_expense', arguments: { amount: 60, category: 'combustível' } }] }
        : { text: 'Anotei R$ 60 em combustível.', toolCalls: [] });
    } });
    const expenseRunner = new AgentOrchestrator(model, new ToolRegistry(createPersonalAgendaTools(personalStore)));
    const expenseRequest = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    const expenseInput = { text: 'Gastei 60 reais com combustível', source: 'voice' as const, timezone: context.timezone };
    const expenseId = await queue.enqueue(expenseRequest, expenseInput);
    await processNextBridgeJob(queue, (value, resume) => expenseRunner.run({ text: value.text, context, resume }));
    const expenseResult = (await db.query<{ status: string; result: { kind: string } }>('select status,result from public.agent_bridge_jobs where id=$1', [expenseId])).rows[0];
    assert.equal(expenseResult.status, 'completed');
    assert.equal(expenseResult.result.kind, 'completed');
    assert.equal(expenseWrites, 1);
    assert.equal(await queue.enqueue(expenseRequest, expenseInput), expenseId);
    assert.equal(await processNextBridgeJob(queue, () => { throw new Error('não deve executar'); }), false);
    assert.equal(expenseWrites, 1);
  } finally { await db.close(); }
});
