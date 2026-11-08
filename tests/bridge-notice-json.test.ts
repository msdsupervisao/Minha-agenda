import assert from 'node:assert/strict';
import test from 'node:test';
import { createBridgeNoticeComposer } from '../lib/agent/bridge-notice';

test('aviso aceita JSON formatado e continua validando a mensagem', async () => {
  const input = { schoolClass: { id: 'test', userId: 'test', createdAt: '', updatedAt: '', name: 'Turma', course: 'Design', schedule: null, teacher: null, notes: null, whatsappGroup: null, noticeTemplateDirect: null, noticeTemplateMotivational: null, noticeTemplateImpactful: null }, topic: 'Aula', styleHint: null, baseMessage: null };
  const compose = createBridgeNoticeComposer(async () => '```json\n{"message":"Olá, turma!"}\n```');
  assert.equal((await compose(input)).message, 'Olá, turma!');
  const invalid = createBridgeNoticeComposer(async () => '```json\n{"message":""}\n```');
  await assert.rejects(invalid(input));
});
