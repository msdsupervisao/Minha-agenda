import assert from 'node:assert/strict';
import test from 'node:test';
import type { SchoolClass } from '../lib/assistant/types';
import { parseTime } from '../lib/assistant/parsing';
import {
  defaultNoticeTemplates,
  isWeeklyNoticeCommand,
  requestedNoticeModelNumber,
  resolveWeeklyNotice,
} from '../lib/notices/weekly';

function schoolClass(name: string, course: string): SchoolClass {
  return {
    id: name,
    userId: 'user',
    createdAt: '2026-08-25T00:00:00.000Z',
    updatedAt: '2026-08-25T00:00:00.000Z',
    name,
    course,
    schedule: null,
    teacher: null,
    notes: null,
    whatsappGroup: `grupo ${name}`,
    noticeTemplateDirect: `${course}: direto`,
    noticeTemplateMotivational: `${course}: motivacional`,
    noticeTemplateImpactful: `${course}: impactante`,
  };
}

const classes = [
  schoolClass('Design', 'Designer Gráfico'),
  schoolClass('Informática', 'Informática'),
  schoolClass('Kids', 'Kids Tecnologia'),
];

test('reconhece atalhos de aviso e de carregamento de mensagem', () => {
  assert.equal(isWeeklyNoticeCommand('Aviso de Design'), true);
  assert.equal(isWeeklyNoticeCommand('Carregue a mensagem de Designer 2'), true);
  assert.equal(isWeeklyNoticeCommand('mensagem de Kids Tecnologia dois'), true);
  assert.equal(isWeeklyNoticeCommand('aviso importante'), false);
});

test('identifica o modelo sem confundir o horário com o número do modelo', () => {
  assert.equal(requestedNoticeModelNumber('Mensagem de Designer 2 terça-feira às 20 horas'), 2);
  assert.equal(requestedNoticeModelNumber('Mensagem de Informática modelo 3 quarta às 20'), 3);
  assert.equal(requestedNoticeModelNumber('Aviso de Design terça-feira às 2'), null);
  assert.deepEqual(parseTime('quarta-feira às 8 horas da noite'), { hour: 20, minute: 0 });
  assert.deepEqual(parseTime('quarta-feira às 20 horas'), { hour: 20, minute: 0 });
});

test('resolve Design, Informática e Kids para a turma e os três textos salvos', () => {
  const design = resolveWeeklyNotice(classes, 'Carregue a mensagem de designer 2');
  assert.equal(design?.className, 'Designer Gráfico');
  assert.equal(design?.recipientName, 'grupo Design');
  assert.equal(design?.models[1].body, 'Designer Gráfico: motivacional');

  assert.equal(resolveWeeklyNotice(classes, 'Aviso de informática')?.className, 'Informática');
  assert.equal(resolveWeeklyNotice(classes, 'Mensagem de kids tecnologia 2')?.className, 'Kids Tecnologia');
});

test('gera textos iniciais diferentes para Design, Informática e Kids', () => {
  const design = defaultNoticeTemplates('Designer Gráfico');
  const computing = defaultNoticeTemplates('Informática');
  const kids = defaultNoticeTemplates('Kids Tecnologia');
  assert.match(design.noticeTemplateMotivational, /designers/i);
  assert.match(computing.noticeTemplateImpactful, /tecnologia/i);
  assert.match(kids.noticeTemplateDirect, /famílias/i);
  assert.equal(new Set(Object.values(design)).size, 3);
});
