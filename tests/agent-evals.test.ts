import assert from 'node:assert/strict';
import test from 'node:test';
import fixtureJson from './fixtures/agent-conversations.pt-BR.json';
import { parseAgentEvalFixture, summarizeAgentEvalFixture } from '../lib/agent/eval-fixture';
import {
  EVAL_KNOWN_GAPS,
  EVAL_TOOL_COMPATIBILITY,
  missingCompatibilityEntries,
} from '../lib/agent/eval-tool-compatibility';

const fixture = parseAgentEvalFixture(fixtureJson);

test('fixture do Claude possui 76 casos únicos e cobre as 26 ferramentas declaradas', () => {
  assert.deepEqual(summarizeAgentEvalFixture(fixture), {
    cases: 76,
    uniqueCaseIds: 76,
    declaredTools: 26,
    usedTools: 26,
    categories: 24,
  });
});

test('todo nome conceitual possui decisão explícita de compatibilidade', () => {
  assert.deepEqual(missingCompatibilityEntries(fixture.meta.ferramentas_disponiveis), []);
  const implemented = Object.entries(EVAL_TOOL_COMPATIBILITY)
    .filter(([, compatibility]) => compatibility.status === 'implemented')
    .map(([name]) => name);
  assert.deepEqual(implemented, ['resolve_recipient', 'load_notice_model']);
  assert.deepEqual(EVAL_TOOL_COMPATIBILITY.resolve_recipient.runtimeTools, ['find_classes']);
  assert.deepEqual(EVAL_TOOL_COMPATIBILITY.load_notice_model.runtimeTools, ['get_notice_template']);
  assert.equal(EVAL_TOOL_COMPATIBILITY.schedule_whatsapp_message.status, 'partially_implemented');
  assert.deepEqual(EVAL_TOOL_COMPATIBILITY.schedule_whatsapp_message.runtimeTools, ['prepare_notice_schedule', 'get_schedule_status']);
  assert.equal(EVAL_TOOL_COMPATIBILITY.financial_action.status, 'intentionally_blocked');
});

test('caso do bug aqueles tecnologia exige entidade real e nunca aceita grupo fictício', () => {
  const testCase = fixture.casos.find((candidate) => candidate.id === 'msg-tecnologia-ambiguo-34');
  assert.ok(testCase);
  assert.deepEqual(testCase.esperado.ferramentas, ['resolve_recipient', 'load_notice_model']);
  assert.ok(testCase.esperado.nunca_inventar.some((value) => value.includes('aqueles tecnologia')));
  assert.equal(testCase.esperado.deve_perguntar, true);
});

test('incompatibilidades semânticas conhecidas ficam registradas sem alterar o fixture', () => {
  const allCaseIds = new Set(fixture.casos.map((testCase) => testCase.id));
  assert.deepEqual(EVAL_KNOWN_GAPS.map((gap) => gap.code), [
    'memory_mutation_without_tool',
    'agenda_query_mapped_to_file_search',
    'alternative_outcome_encoded_as_single_expectation',
  ]);
  assert.ok(EVAL_KNOWN_GAPS.every((gap) => gap.caseIds.every((caseId) => allCaseIds.has(caseId))));
});

test('validador rejeita IDs duplicados antes de executar avaliações', () => {
  const invalid = structuredClone(fixtureJson);
  invalid.casos[1].id = invalid.casos[0].id;
  assert.throws(() => parseAgentEvalFixture(invalid), /ID de caso duplicado/);
});
