import assert from 'node:assert/strict';
import test from 'node:test';
import { dueNotifications, type NotifiableItem } from '../lib/notifications/schedule';

const event: NotifiableItem = {
  itemType: 'event', id: 'event-1', userId: 'user-1', title: 'Consulta',
  anchorIso: '2026-10-25T15:00:00.000Z', alerts: [60], channels: ['push'],
};

test('schedule: evento com 1 hora de antecedência vira push no instante correto', () => {
  const due = dueNotifications(event, 'America/Sao_Paulo', new Date('2026-10-25T14:00:00.000Z'));
  assert.equal(due.length, 1);
  assert.equal(due[0].fireAt, '2026-10-25T14:00:00.000Z');
  assert.equal(due[0].offsetMinutes, 60);
  assert.match(due[0].dedupeKey, /event:event-1:2026-10-25T15:00:00\.000Z:60:push/);
});

test('schedule: expande múltiplos avisos e canais sem duplicar', () => {
  const due = dueNotifications({ ...event, alerts: [1440, 60, 60], channels: ['push', 'whatsapp', 'push'] }, 'Europe/Lisbon', new Date('2026-10-25T15:00:00.000Z'));
  assert.equal(due.length, 4);
  assert.equal(new Set(due.map((item) => item.dedupeKey)).size, 4);
  assert.deepEqual(due.map((item) => `${item.offsetMinutes}:${item.channel}`), ['1440:push', '1440:whatsapp', '60:push', '60:whatsapp']);
});

test('schedule: não libera aviso futuro e diferencia ocorrências reagendadas', () => {
  const now = new Date('2026-10-25T13:59:59.000Z');
  assert.equal(dueNotifications(event, 'America/Cuiaba', now).length, 0);
  const next = dueNotifications({ ...event, anchorIso: '2026-10-26T15:00:00.000Z' }, 'America/Cuiaba', new Date('2026-10-26T14:00:00.000Z'))[0];
  assert.notEqual(next.dedupeKey, dueNotifications(event, 'America/Cuiaba', new Date('2026-10-25T14:00:00.000Z'))[0].dedupeKey);
});

test('schedule: valida fuso IANA antes de calcular', () => {
  assert.throws(() => dueNotifications(event, 'fuso-inexistente', new Date()), /Fuso horário inválido/);
});
