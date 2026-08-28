import assert from 'node:assert/strict';
import test from 'node:test';
import { z } from 'zod';
import { ToolRegistry } from '../lib/agent/tool-registry';
import { createClassTools, type ClassCatalog } from '../lib/agent/tools/classes';
import { createNoticeScheduleTools, type ScheduleHandoffStore } from '../lib/agent/tools/notice-schedule';

// Keywords fora do subconjunto aceito pelo modo strict. O teste é propositalmente
// independente da constante de produção para detectar regressões no sanitizador.
const FORBIDDEN_KEYWORDS = new Set([
  'minLength', 'maxLength',
  'allOf', 'oneOf', 'not', 'dependentRequired', 'dependentSchemas', 'if', 'then', 'else',
  'uniqueItems', 'contains', 'minContains', 'maxContains',
  'minProperties', 'maxProperties', 'patternProperties', 'propertyNames',
  'unevaluatedItems', 'unevaluatedProperties', 'default',
]);

const catalog: ClassCatalog = { async list() { return []; } };
const store: ScheduleHandoffStore = {
  async create() { throw new Error('não usado'); },
  async find() { return null; },
};

function collectForbidden(node: unknown, path: string[], hits: string[]): void {
  if (Array.isArray(node)) {
    node.forEach((item, index) => collectForbidden(item, [...path, String(index)], hits));
    return;
  }
  if (!node || typeof node !== 'object') return;
  for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
    // Não descer em 'properties' como se as chaves fossem keywords: os nomes de
    // propriedade podem coincidir legitimamente com uma keyword.
    if (key === 'properties' || key === '$defs' || key === 'definitions') {
      for (const [propName, propSchema] of Object.entries(value as Record<string, unknown>)) {
        collectForbidden(propSchema, [...path, key, propName], hits);
      }
      continue;
    }
    if (FORBIDDEN_KEYWORDS.has(key)) hits.push([...path, key].join('.'));
    collectForbidden(value, [...path, key], hits);
  }
}

test('descriptors não emitem keywords incompatíveis com o strict da OpenAI', () => {
  const registry = new ToolRegistry([
    ...createClassTools(catalog),
    ...createNoticeScheduleTools(catalog, store),
  ]);

  const descriptors = registry.descriptors();
  assert.ok(descriptors.length >= 4);

  for (const descriptor of descriptors) {
    const hits: string[] = [];
    collectForbidden(descriptor.parameters, [descriptor.name], hits);
    assert.deepEqual(hits, [], `keywords proibidas em ${descriptor.name}: ${hits.join(', ')}`);
  }
});

test('descriptors preservam os invariantes exigidos pelo strict', () => {
  const registry = new ToolRegistry([
    ...createClassTools(catalog),
    ...createNoticeScheduleTools(catalog, store),
  ]);

  for (const descriptor of registry.descriptors()) {
    const params = descriptor.parameters as Record<string, unknown>;
    assert.equal(params.type, 'object', `${descriptor.name} deve ser object`);
    assert.equal(params.additionalProperties, false, `${descriptor.name} precisa de additionalProperties:false`);
    const properties = Object.keys((params.properties as Record<string, unknown>) || {});
    const required = (params.required as string[]) || [];
    assert.deepEqual(
      [...required].sort(),
      [...properties].sort(),
      `${descriptor.name}: required deve conter todas as propriedades`,
    );
  }
});

test('descriptors preservam restrições suportadas pela OpenAI', () => {
  const registry = new ToolRegistry([{
    name: 'documented_constraints',
    description: 'Valida as restrições documentadas para schemas strict.',
    risk: 'read',
    inputSchema: z.object({
      id: z.string().uuid(),
      score: z.number().min(1).max(10).multipleOf(0.5),
      tags: z.array(z.string()).min(1).max(3),
    }).strict(),
    async execute() { return {}; },
  }]);

  const params = registry.descriptors()[0].parameters as Record<string, unknown>;
  const properties = params.properties as Record<string, Record<string, unknown>>;

  assert.equal(properties.id.format, 'uuid');
  assert.equal(typeof properties.id.pattern, 'string');
  assert.equal(properties.score.minimum, 1);
  assert.equal(properties.score.maximum, 10);
  assert.equal(properties.score.multipleOf, 0.5);
  assert.equal(properties.tags.minItems, 1);
  assert.equal(properties.tags.maxItems, 3);
});
