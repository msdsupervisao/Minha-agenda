import assert from 'node:assert/strict';
import test from 'node:test';
import { ToolRegistry } from '../lib/agent/tool-registry';
import { classMatchScore, createClassTools, type ClassCatalog } from '../lib/agent/tools/classes';
import type { AgentExecutionContext } from '../lib/agent/contracts';
import { emptyAgentContextState } from '../lib/agent/contracts';
import type { SchoolClass } from '../lib/assistant/types';

const context: AgentExecutionContext = {
  userId: 'user-classes',
  source: 'voice',
  now: new Date('2026-08-27T00:26:47.000Z'),
  timezone: 'America/Cuiaba',
  state: emptyAgentContextState(),
};

const kids: SchoolClass = {
  id: '11111111-1111-4111-8111-111111111111',
  userId: context.userId,
  createdAt: context.now.toISOString(),
  updatedAt: context.now.toISOString(),
  name: 'Kids Tecnologia',
  course: 'Tecnologia para crianças',
  schedule: 'quinta às 9h',
  teacher: 'Fernando',
  notes: null,
  whatsappGroup: 'Kids Tecnologia',
  noticeTemplateDirect: 'Modelo direto Kids',
  noticeTemplateMotivational: 'Modelo motivacional Kids',
  noticeTemplateImpactful: 'Modelo de impacto Kids',
};

const design: SchoolClass = {
  ...kids,
  id: '22222222-2222-4222-8222-222222222222',
  name: 'Design Gráfico',
  course: 'Design Gráfico',
  whatsappGroup: 'Design Gráfico',
  noticeTemplateDirect: 'Modelo direto Design',
  noticeTemplateMotivational: 'Modelo motivacional Design',
  noticeTemplateImpactful: 'Modelo de impacto Design',
};

const catalog: ClassCatalog = { async list() { return [design, kids]; } };

test('busca de entidade recupera Kids Tecnologia do erro real de transcrição', async () => {
  const registry = new ToolRegistry(createClassTools(catalog));
  const result = await registry.execute({
    callId: 'find-1',
    name: 'find_classes',
    arguments: { query: 'aqueles tecnologia' },
  }, context);

  assert.equal(result.status, 'success');
  assert.equal(result.verified, true);
  const output = result.output as { resolution: string; matches: Array<{ id: string; name: string; score: number }> };
  assert.equal(output.matches[0].id, kids.id);
  assert.equal(output.matches[0].name, 'Kids Tecnologia');
  assert.ok(output.matches[0].score > 0.35);
  assert.equal(output.resolution, 'ambiguous');
});

test('nome exato produz candidato provável sem perder o vínculo com o cadastro', async () => {
  const registry = new ToolRegistry(createClassTools(catalog));
  const result = await registry.execute({
    callId: 'find-exact',
    name: 'find_classes',
    arguments: { query: 'Kids Tecnologia' },
  }, context);
  const output = result.output as { resolution: string; matches: Array<{ id: string }> };
  assert.equal(output.resolution, 'likely_single');
  assert.equal(output.matches[0].id, kids.id);
});

test('pontuação de entidade compara dados cadastrados, não interpreta comandos', () => {
  assert.ok(classMatchScore('turma de design', design) > classMatchScore('turma de design', kids));
  assert.ok(classMatchScore('tecnologia', kids) > classMatchScore('tecnologia', design));
});

test('modelo de aviso é carregado por id real e número validado', async () => {
  const registry = new ToolRegistry(createClassTools(catalog));
  const result = await registry.execute({
    callId: 'template-1',
    name: 'get_notice_template',
    arguments: { classId: kids.id, modelNumber: 2 },
  }, context);

  assert.equal(result.status, 'success');
  const output = result.output as { found: boolean; recipient: string; body: string; modelNumber: number };
  assert.equal(output.found, true);
  assert.equal(output.recipient, 'Kids Tecnologia');
  assert.equal(output.body, 'Modelo motivacional Kids');
  assert.equal(output.modelNumber, 2);
});

test('modelo inexistente não inventa turma nem conteúdo', async () => {
  const registry = new ToolRegistry(createClassTools(catalog));
  const result = await registry.execute({
    callId: 'template-missing',
    name: 'get_notice_template',
    arguments: { classId: '33333333-3333-4333-8333-333333333333', modelNumber: 2 },
  }, context);
  assert.deepEqual(result.output, { found: false, classId: '33333333-3333-4333-8333-333333333333' });
});
