import assert from 'node:assert/strict';
import test from 'node:test';
import { createCourseKnowledgeTools } from '../lib/agent/tools/course-knowledge';
import { buildAgentInstructions } from '../lib/agent/orchestrator';
import { emptyAgentContextState, type AgentExecutionContext } from '../lib/agent/contracts';
const context: AgentExecutionContext = { userId: 'test', source: 'text', timezone: 'America/Cuiaba', now: new Date(), state: emptyAgentContextState() };

test('fatos do Tiozão ficam fora do prompt global e são retornados pela consulta específica', async () => {
  const prompt = buildAgentInstructions({ text: 'Ferramentas para criar vídeos no YouTube?', context });
  assert.doesNotMatch(prompt, /Roblox|Six Seven|Fernando e Gabriel|mascote querido/);
  const result = await createCourseKnowledgeTools()[0].execute({ topic: 'tiozao_gamer' }, context);
  assert.match(JSON.stringify(result), /Fernando e Gabriel/);
  assert.match(JSON.stringify(result), /nunca punições reais/);
});
