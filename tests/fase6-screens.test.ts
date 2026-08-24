import assert from 'node:assert/strict';
import test from 'node:test';
import { buildAgendaItems, groupAgenda, curateForToday } from '../lib/data/agenda';
import {
  wallTimeToUtcIso, zonedStartOfDay, zonedStartOfMonth,
  normalizeExpenseFilter, expenseRangeStart, isValidTimeZone,
} from '../lib/data/time';
import { rangeBounds } from '../lib/assistant/memory';
import { formatBRL, formatTime, relativeDayLabel, toDatetimeLocal } from '../lib/format';
import type { CalendarEvent, Reminder, Task } from '../lib/assistant/types';

// America/Cuiaba é UTC-4 sem horário de verão — usado como fuso padrão do app.
const NOW = new Date('2026-08-20T12:00:00.000Z'); // 08:00 em Cuiaba

function reminder(id: string, dueAt: string, delivered = false): Reminder {
  return { id, userId: 'u', createdAt: dueAt, updatedAt: dueAt, title: `r-${id}`, dueAt, contactId: null, notificationStatus: delivered ? 'delivered' : 'pending' };
}
function task(id: string, dueAt: string | null, done = false): Task {
  return { id, userId: 'u', createdAt: '2026-08-01T00:00:00Z', updatedAt: '2026-08-01T00:00:00Z', title: `t-${id}`, status: done ? 'done' : 'open', dueAt, contactId: null };
}
function event(id: string, startsAt: string): CalendarEvent {
  return { id, userId: 'u', createdAt: startsAt, updatedAt: startsAt, title: `e-${id}`, startsAt, endsAt: null, contactId: null };
}

test('fuso: wallTimeToUtcIso converte hora de parede de Cuiaba para UTC', () => {
  assert.equal(wallTimeToUtcIso('2026-08-21T09:00'), '2026-08-21T13:00:00.000Z');
});

test('fuso: conversão explícita acompanha diferentes relógios do dispositivo', () => {
  assert.equal(wallTimeToUtcIso('2026-08-21T09:00', 'America/Sao_Paulo'), '2026-08-21T12:00:00.000Z');
  assert.equal(wallTimeToUtcIso('2026-08-21T09:00', 'America/Cuiaba'), '2026-08-21T13:00:00.000Z');
  assert.equal(wallTimeToUtcIso('2026-08-21T09:00', 'Europe/Lisbon'), '2026-08-21T08:00:00.000Z');
  assert.equal(isValidTimeZone('America/Sao_Paulo'), true);
  assert.equal(isValidTimeZone('fuso/inexistente'), false);
});

test('fuso: consultas de hoje usam os limites do dispositivo', () => {
  const reference = new Date('2026-08-20T12:00:00.000Z');
  assert.equal(rangeBounds('today', reference, 'America/Sao_Paulo').start.toISOString(), '2026-08-20T03:00:00.000Z');
  assert.equal(rangeBounds('today', reference, 'America/Cuiaba').start.toISOString(), '2026-08-20T04:00:00.000Z');
  assert.equal(rangeBounds('today', reference, 'Europe/Lisbon').start.toISOString(), '2026-08-19T23:00:00.000Z');
});

test('fuso: zonedStartOfDay e zonedStartOfMonth ancoram no fuso do app', () => {
  assert.equal(zonedStartOfDay(NOW).toISOString(), '2026-08-20T04:00:00.000Z');
  assert.equal(zonedStartOfMonth(NOW).toISOString(), '2026-08-01T04:00:00.000Z');
});

test('fuso: datetime-local ida e volta é estável', () => {
  assert.equal(toDatetimeLocal(wallTimeToUtcIso('2026-08-21T09:00')), '2026-08-21T09:00');
  assert.equal(toDatetimeLocal('2026-08-20T22:00:00.000Z'), '2026-08-20T18:00');
  assert.equal(formatTime('2026-08-20T22:00:00.000Z'), '18:00');
});

test('filtros de gasto: normalização e início do período', () => {
  assert.equal(normalizeExpenseFilter(undefined), '7d');
  assert.equal(normalizeExpenseFilter('today'), 'today');
  assert.equal(normalizeExpenseFilter('lixo'), '7d');
  assert.equal(expenseRangeStart('all', NOW), null);
  assert.equal(expenseRangeStart('today', NOW)?.toISOString(), zonedStartOfDay(NOW).toISOString());
});

test('agenda: itens são mesclados e ordenados por data', () => {
  const items = buildAgendaItems(
    [reminder('r1', '2026-08-22T12:00:00Z')],
    [task('t1', '2026-08-20T12:00:00Z')],
    [event('e1', '2026-08-21T12:00:00Z')],
  );
  assert.deepEqual(items.map((i) => i.id), ['t1', 'e1', 'r1']);
  assert.deepEqual(items.map((i) => i.kind), ['task', 'event', 'reminder']);
});

test('agenda: agrupamento separa atrasado, hoje, amanhã e sem data', () => {
  const items = buildAgendaItems(
    [reminder('late', '2026-08-19T13:00:00Z'), reminder('today', '2026-08-20T22:00:00Z')],
    [task('nodate', null)],
    [event('tomorrow', '2026-08-21T14:00:00Z')],
  );
  const groups = groupAgenda(items, NOW);
  const labels = groups.map((g) => g.label);

  assert.equal(groups[0].key, 'late');
  assert.deepEqual(groups[0].items.map((i) => i.id), ['late']);
  assert.ok(labels.includes('Hoje'));
  assert.ok(labels.includes('Amanhã'));
  assert.equal(groups.at(-1)?.key, 'nodate');
  assert.deepEqual(groups.at(-1)?.items.map((i) => i.id), ['nodate']);
});

test('agenda: item concluído não conta como atrasado', () => {
  const items = buildAgendaItems([reminder('done', '2026-08-19T13:00:00Z', true)], [], []);
  const groups = groupAgenda(items, NOW);
  assert.equal(groups.find((g) => g.key === 'late'), undefined);
});

test('hoje: curadoria prioriza atenção, hoje, aguardando e depois', () => {
  const items = buildAgendaItems(
    [reminder('late', '2026-08-19T13:00:00Z'), reminder('today', '2026-08-20T22:00:00Z')],
    [task('nodate', null)],
    [event('tomorrow', '2026-08-21T14:00:00Z')],
  );
  const curated = curateForToday(items, NOW);
  const keys = curated.map((g) => g.key);
  assert.deepEqual(keys, ['late', 'today', 'nodate', 'depois']);
  assert.deepEqual(curated.find((g) => g.key === 'depois')?.items.map((i) => i.id), ['tomorrow']);
});

test('formato: valores em BRL e rótulos de dia relativos', () => {
  assert.match(formatBRL(35), /R\$\s?35,00/);
  assert.equal(relativeDayLabel(NOW.toISOString(), undefined, NOW), 'Hoje');
  assert.equal(relativeDayLabel('2026-08-21T14:00:00Z', undefined, NOW), 'Amanhã');
});
