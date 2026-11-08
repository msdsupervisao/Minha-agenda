import assert from 'node:assert/strict';
import test from 'node:test';
import { z } from 'zod';
import { StructuredTextAgentProvider } from '../lib/agent/providers/structured-text';
import { AgentOrchestrator } from '../lib/agent/orchestrator';
import { ToolRegistry } from '../lib/agent/tool-registry';
import { emptyAgentContextState, type AgentExecutionContext } from '../lib/agent/contracts';

const context: AgentExecutionContext = { userId: 'user', source: 'voice', now: new Date('2026-11-06T12:00:00Z'), timezone: 'America/Cuiaba', state: emptyAgentContextState() };

test('modelo propõe gasto, aplicação valida e registra, resultado volta ao modelo', async () => {
  let writes = 0;
  const prompts: string[] = [];
  const provider = new StructuredTextAgentProvider({ model: 'fake', async generateText(prompt) {
    prompts.push(prompt);
    return prompts.length === 1
      ? JSON.stringify({ text: '', toolCalls: [{ name: 'create_expense', arguments: { amount: 60, category: 'combustível' } }] })
      : JSON.stringify({ text: 'Anotei R$ 60,00 em combustível.', toolCalls: [] });
  } });
  const registry = new ToolRegistry([{ name: 'create_expense', description: 'Registra gasto', risk: 'low', inputSchema: z.object({ amount: z.number().positive(), category: z.string() }).strict(), async execute() { writes++; return { id: 'saved' }; }, async verify() { return { verified: true }; } }]);
  const result = await new AgentOrchestrator(provider, registry).run({ text: 'Gastei 60 reais com combustível', context });
  assert.equal(result.kind, 'completed');
  assert.equal(writes, 1);
  assert.match(prompts[1], /"verified":true/);
  assert.match(prompts[1], /create_expense/);
});

test('resposta inválida ou ferramenta não autorizada não gera chamadas', async () => {
  const request = { instructions: 'teste', messages: [{ role: 'user' as const, content: 'teste' }], tools: [] };
  for (const raw of ['não é JSON', '{"text":"","toolCalls":[]}', '{"text":"","toolCalls":[{"name":"shell","arguments":{}}]}']) {
    const provider = new StructuredTextAgentProvider({ model: 'fake', async generateText() { return raw; } });
    await assert.rejects(provider.generate(request), /agent_provider_/);
  }
});

test('aceita JSON em bloco Markdown sem aceitar texto extra', async () => {
  const request = { instructions: 'teste', messages: [{ role: 'user' as const, content: 'teste' }], tools: [] };
  const wrapped = new StructuredTextAgentProvider({ model: 'fake', async generateText() { return '```json\n{"text":"Olá","toolCalls":[]}\n```'; } });
  assert.equal((await wrapped.generate(request)).text, 'Olá');
  const extra = new StructuredTextAgentProvider({ model: 'fake', async generateText() { return 'texto antes\n```json\n{"text":"Olá","toolCalls":[]}\n```'; } });
  await assert.rejects(extra.generate(request), /agent_provider_invalid_response/);
});
