import assert from 'node:assert/strict';
import test from 'node:test';
import { sendAgentTurn } from '../lib/agent/client';
import type { AgentProgress } from '../lib/agent/contracts';

function streamed(text: string): typeof fetch {
  return async () => new Response(new ReadableStream({
    start(controller) {
      const bytes = new TextEncoder().encode(text);
      for (let index = 0; index < bytes.length; index += 7) controller.enqueue(bytes.slice(index, index + 7));
      controller.close();
    },
  }), { headers: { 'content-type': 'application/x-ndjson' } });
}

test('progresso fragmentado preserva UTF-8 e só conclui com o resultado final', async () => {
  const progress: AgentProgress[] = [];
  const result = await sendAgentTurn({ text: 'Liste.', source: 'text' }, (event) => progress.push(event), streamed([
    { type: 'progress', progress: { phase: 'thinking', step: 1 } },
    { type: 'progress', progress: { phase: 'verified', step: 1, toolName: 'list_classes' } },
    { type: 'result', httpStatus: 200, result: { kind: 'completed', verified: true, reply: 'Turmas conferidas na memória.' } },
  ].map((event) => `${JSON.stringify(event)}\n`).join('')));
  assert.equal(result.reply, 'Turmas conferidas na memória.');
  assert.deepEqual(progress.map((event) => event.phase), ['thinking', 'verified']);
});

test('conexão interrompida e sessão expirada nunca viram sucesso', async () => {
  await assert.rejects(sendAgentTurn({ text: 'Liste.', source: 'text' }, () => {}, streamed('{"type":"progress","progress":{"phase":"thinking","step":1}}\n')), /interrompida/);
  await assert.rejects(sendAgentTurn({ text: 'Liste.', source: 'text' }, () => {}, streamed('{"type":"result","httpStatus":401,"result":{"error":"Sessão expirada."}}\n')), /Sessão expirada/);
});
