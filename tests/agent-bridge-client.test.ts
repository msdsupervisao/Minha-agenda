import assert from 'node:assert/strict';
import test from 'node:test';
import { resumeBridgeTurn, sendBridgeTurn } from '../lib/agent/bridge-client';

test('retoma pedido após falha de rede sem enfileirar uma segunda vez', async () => {
  const values = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value), removeItem: (key: string) => values.delete(key) } });
  const originalFetch = globalThis.fetch;
  let posts = 0;
  globalThis.fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
    if (init?.method === 'POST') { posts++; throw new Error('conexão caiu'); }
    return Response.json({ id: 'saved-job', status: 'completed', result: { kind: 'completed', reply: 'Gasto salvo.' } });
  }) as typeof fetch;
  try {
    await assert.rejects(sendBridgeTurn({ text: 'Gastei 60 reais', source: 'voice' }, 'user-a'));
    assert.equal(resumeBridgeTurn('user-b'), null);
    const resumed = resumeBridgeTurn('user-a');
    assert.ok(resumed);
    assert.equal((await resumed).reply, 'Gasto salvo.');
    assert.equal(posts, 1);
    assert.equal(resumeBridgeTurn('user-a'), null);
  } finally { globalThis.fetch = originalFetch; delete (globalThis as { localStorage?: unknown }).localStorage; }
});

test('reenvia com o mesmo identificador se o primeiro envio não chegou ao servidor', async () => {
  const values = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value), removeItem: (key: string) => values.delete(key) } });
  const originalFetch = globalThis.fetch;
  const requests: Array<Record<string, unknown>> = [];
  let lookedUp = false;
  globalThis.fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
    if (init?.method === 'POST') {
      requests.push(JSON.parse(String(init.body)) as Record<string, unknown>);
      if (requests.length === 1) throw new Error('offline');
      return Response.json({ id: 'saved-job' }, { status: 202 });
    }
    if (!lookedUp) { lookedUp = true; return Response.json({ error: 'Pedido não encontrado.' }, { status: 404 }); }
    return Response.json({ id: 'saved-job', status: 'completed', result: { kind: 'completed', reply: 'Gasto salvo.' } });
  }) as typeof fetch;
  try {
    await assert.rejects(sendBridgeTurn({ text: 'Gastei 60 reais', source: 'voice' }, 'user-a'));
    const resumed = resumeBridgeTurn('user-a');
    assert.ok(resumed);
    assert.equal((await resumed).reply, 'Gasto salvo.');
    assert.equal(requests.length, 2);
    assert.deepEqual(requests[1], requests[0]);
    assert.equal(resumeBridgeTurn('user-a'), null);
  } finally { globalThis.fetch = originalFetch; delete (globalThis as { localStorage?: unknown }).localStorage; }
});

test('resposta 503 ao confirmar preserva a possibilidade de recuperar a aprovação', async () => {
  const values = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value), removeItem: (key: string) => values.delete(key) } });
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
    if (init?.method === 'POST') return Response.json({ error: 'Indisponível.' }, { status: 503 });
    return Response.json({ id: 'job-id', status: 'approval_required', result: { kind: 'approval_required', reply: 'Confirma?', approvalId: 'job-id' } });
  }) as typeof fetch;
  try {
    await assert.rejects(sendBridgeTurn({ approvalId: 'job-id', decision: 'approve' }, 'user-a'));
    const recovered = resumeBridgeTurn('user-a');
    assert.ok(recovered);
    assert.equal((await recovered).approvalId, 'job-id');
  } finally { globalThis.fetch = originalFetch; delete (globalThis as { localStorage?: unknown }).localStorage; }
});

test('aprovação pode ser retomada e confirmada sem criar outro pedido', async () => {
  const values = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value), removeItem: (key: string) => values.delete(key) } });
  const originalFetch = globalThis.fetch;
  let approved = false;
  globalThis.fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
    if (init?.method === 'POST') {
      const payload = JSON.parse(String(init.body));
      if (payload.decision === 'approve') approved = true;
      return Response.json({ id: 'job-id' }, { status: 202 });
    }
    return Response.json(approved
      ? { id: 'job-id', status: 'completed', result: { kind: 'completed', reply: 'Concluído.' } }
      : { id: 'job-id', status: 'approval_required', result: { kind: 'approval_required', reply: 'Confirma?', approvalId: 'job-id' } });
  }) as typeof fetch;
  try {
    const pending = await sendBridgeTurn({ text: 'Preparar aviso', source: 'voice' }, 'user-a');
    assert.equal(pending.kind, 'approval_required');
    const recovered = resumeBridgeTurn('user-a');
    assert.ok(recovered);
    assert.equal((await recovered).approvalId, 'job-id');
    assert.equal((await sendBridgeTurn({ approvalId: 'job-id', decision: 'approve' }, 'user-a')).kind, 'completed');
    assert.equal(resumeBridgeTurn('user-a'), null);
  } finally { globalThis.fetch = originalFetch; delete (globalThis as { localStorage?: unknown }).localStorage; }
});
