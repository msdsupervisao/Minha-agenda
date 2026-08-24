import test from 'node:test';
import assert from 'node:assert/strict';
import { parseRecurrence, stripRecurrence, firstRecurringDue, nextRecurringDue, recurrenceFromMeta } from '../lib/assistant/recurrence';
import { interpretCommand } from '../lib/assistant/interpreter';

const TZ = 'America/Cuiaba'; // UTC-4, sem horário de verão

function localHM(iso: string) {
  return new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(iso));
}
function localDate(iso: string) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso));
}

test('parseRecurrence entende diário, semanal e mensal', () => {
  assert.equal(parseRecurrence('me lembre de olhar o datashow todos os dias as 13h'), 'daily');
  assert.equal(parseRecurrence('me lembre disso todo dia'), 'daily');
  assert.equal(parseRecurrence('me lembre toda segunda as 9h'), 'weekly');
  assert.equal(parseRecurrence('me lembre toda semana de regar as plantas'), 'weekly');
  assert.equal(parseRecurrence('me lembre todo dia 15 de pagar o aluguel'), 'monthly');
  assert.equal(parseRecurrence('me lembre todo mes de conferir o estoque'), 'monthly');
  assert.equal(parseRecurrence('me lembre de ligar amanha as 9h'), null);
});

test('stripRecurrence remove a expressão de repetição do título', () => {
  assert.equal(stripRecurrence('olhar o problema no datashow, todos os dias'), 'olhar o problema no datashow');
  assert.equal(stripRecurrence('regar as plantas toda segunda-feira'), 'regar as plantas');
});

test('firstRecurringDue diário: hoje se o horário ainda não passou, senão amanhã', () => {
  const manha = new Date('2026-08-24T10:00:00-04:00'); // 10h local
  const due1 = firstRecurringDue('daily', 'as 13h', manha, TZ);
  assert.equal(localHM(due1), '13:00');
  assert.equal(localDate(due1), '2026-08-24'); // mesmo dia
  assert.ok(new Date(due1).getTime() > manha.getTime());

  const tarde = new Date('2026-08-24T14:00:00-04:00'); // 14h local, já passou das 13h
  const due2 = firstRecurringDue('daily', 'as 13h', tarde, TZ);
  assert.equal(localHM(due2), '13:00');
  assert.equal(localDate(due2), '2026-08-25'); // dia seguinte
});

test('nextRecurringDue avança para a próxima ocorrência futura', () => {
  const now = new Date('2026-08-24T17:30:00Z');
  assert.equal(nextRecurringDue('2026-08-24T17:00:00.000Z', 'daily', now), '2026-08-25T17:00:00.000Z');
  assert.equal(nextRecurringDue('2026-08-24T17:00:00.000Z', 'weekly', now), '2026-08-31T17:00:00.000Z');
  assert.equal(nextRecurringDue('2026-08-15T13:00:00.000Z', 'monthly', new Date('2026-09-01T00:00:00Z')), '2026-09-15T13:00:00.000Z');
});

test('recurrenceFromMeta lê o metadata jsonb', () => {
  assert.equal(recurrenceFromMeta({ recurrence: 'daily' }), 'daily');
  assert.equal(recurrenceFromMeta({}), null);
  assert.equal(recurrenceFromMeta(null), null);
  assert.equal(recurrenceFromMeta({ recurrence: 'nope' }), null);
});

test('interpretCommand registra o lembrete recorrente do usuário (datashow, todos os dias às 13h)', () => {
  const now = new Date('2026-08-24T10:00:00-04:00');
  const action = interpretCommand('me lembre de olhar o problema no datashow, todos os dias as 13h', now, TZ);
  assert.ok(action, 'deveria interpretar');
  assert.equal(action!.intent, 'create_reminder');
  assert.equal(action!.data.recurrence, 'daily');
  assert.equal(action!.data.title, 'olhar o problema no datashow');
  assert.ok(action!.data.dueAt, 'deveria ter dueAt');
  assert.equal(localHM(String(action!.data.dueAt)), '13:00');
});
