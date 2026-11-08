import assert from 'node:assert/strict';
import test from 'node:test';
import { processNextBridgeJob } from '../lib/agent/bridge-worker';
import { emptyAgentUsage, type AgentRunResult } from '../lib/agent/contracts';
import type { BridgeJob } from '../lib/agent/bridge-queue';

const job: BridgeJob = { id: 'id', claimToken: 'token', input: { text: 'Crie aviso', source: 'voice', timezone: 'America/Cuiaba' }, approved: false, priorResult: null };
const call = { callId: 'call', name: 'prepare_notice_schedule', arguments: { body: 'Aviso' } };
const pending: AgentRunResult = { kind: 'approval_required', reply: 'Confirma?', pendingCalls: [call], pendingApprovals: [], continuation: { kind: 'agent_approval' }, provider: 'fake', model: 'fake', steps: 1, toolResults: [], usage: emptyAgentUsage() };

test('o worker preserva a aprovação e retoma apenas a chamada aprovada', async () => {
  let current = job;
  const saved: Array<{ status: string; result: Record<string, unknown> }> = [];
  const queue = { async claim() { return current; }, async finish(_job: BridgeJob, status: 'completed' | 'failed' | 'approval_required', result: Record<string, unknown>) { saved.push({ status, result }); } };
  await processNextBridgeJob(queue, async (_input, resume) => { assert.equal(resume, undefined); return pending; });
  assert.equal(saved[0].status, 'approval_required');
  current = { ...job, approved: true, priorResult: saved[0].result };
  await processNextBridgeJob(queue, async (_input, resume) => {
    assert.deepEqual(resume, { pendingCalls: [call], continuation: { kind: 'agent_approval' } });
    return { kind: 'completed', reply: 'Concluído', verified: true, provider: 'fake', model: 'fake', steps: 1, toolResults: [], usage: emptyAgentUsage() };
  });
  assert.equal(saved[1].status, 'completed');
});

test('falha de execução termina o pedido sem tentar gravar novamente', async () => {
  let attempts = 0;
  let status = '';
  const queue = { async claim() { return job; }, async finish(_job: BridgeJob, value: 'completed' | 'failed' | 'approval_required') { status = value; } };
  await processNextBridgeJob(queue, async () => { attempts++; throw new Error('falha'); });
  assert.equal(attempts, 1);
  assert.equal(status, 'failed');
});
