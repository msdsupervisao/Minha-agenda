import assert from 'node:assert/strict';
import test from 'node:test';
import { BridgeInputSchema, BridgeQueue } from '../lib/agent/bridge-queue';

const id = 'cfc4f48c-f2d2-430e-9bdf-76987ef8a52b';
const token = '93dd6cae-4784-483f-8264-979692c73107';
const input = { text: 'Gastei 60 reais com combustível', source: 'voice' as const, timezone: 'America/Cuiaba' };

test('fila valida pedidos e exige o token da reserva para concluir', async () => {
  const calls: Array<{ name: string; args: Record<string, unknown> | undefined }> = [];
  const fake = { async rpc(name: string, args?: Record<string, unknown>) {
    calls.push({ name, args });
    if (name === 'agent_bridge_enqueue') return { data: id, error: null };
    if (name === 'agent_bridge_claim') return { data: [{ id, input, claim_token: token, approved: false, prior_result: null }], error: null };
    return { data: true, error: null };
  } };
  const queue = new BridgeQueue(fake as never);
  assert.equal(await queue.enqueue(id, input), id);
  const job = await queue.claim();
  assert.deepEqual(job, { id, input, claimToken: token, approved: false, priorResult: null });
  assert.ok(job);
  await queue.finish(job, 'completed', { kind: 'completed' });
  assert.equal(calls[2].args?.p_claim_token, token);
  assert.equal(BridgeInputSchema.safeParse({ ...input, timezone: 'fuso-inexistente' }).success, false);
  assert.equal(BridgeInputSchema.safeParse({ ...input, extra: 'não permitido' }).success, false);
});

test('distingue indisponibilidade da fila de uma aprovação já usada', async () => {
  const unavailable = new BridgeQueue({ async rpc() { return { data: null, error: { message: 'offline' } }; } } as never);
  const alreadyUsed = new BridgeQueue({ async rpc() { return { data: false, error: null }; } } as never);
  await assert.rejects(unavailable.decide(id, 'approve'), /bridge_decision_unavailable/);
  await assert.rejects(alreadyUsed.decide(id, 'approve'), /bridge_decision_not_pending/);
});
