import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { notificationFromMeta } from '../lib/data/supabase-memory-repository';
import { channelList } from '../lib/notifications/dispatch';
import { dueNotifications } from '../lib/notifications/schedule';

test('metadata: defaults preservam lembretes legados e dão 1 hora a eventos/tarefas', () => {
  assert.deepEqual(notificationFromMeta({}, 'reminder'), { alerts: [0], channels: ['push'] });
  assert.deepEqual(notificationFromMeta({}, 'event'), { alerts: [60], channels: ['push'] });
  assert.deepEqual(notificationFromMeta({ alerts: [1440, 60, 60], channels: ['whatsapp', 'push'] }, 'task'), { alerts: [1440, 60], channels: ['whatsapp', 'push'] });
});

test('metadata: canal inválido ou lista vazia cai em push', () => {
  assert.deepEqual(channelList(['email', 'push']), ['push']);
  assert.deepEqual(channelList([]), ['push']);
  assert.deepEqual(notificationFromMeta({ alerts: ['invalid'], channels: ['email'] }, 'reminder'), { alerts: [0], channels: ['push'] });
  assert.deepEqual(notificationFromMeta({ alerts: [], channels: [] }, 'event'), { alerts: [60], channels: ['push'] });
});

test('migration: deliveries têm chave única por disparo e status observável', () => {
  const sql = readFileSync(join(process.cwd(), 'supabase/migrations/20261025000100_notifications.sql'), 'utf8');
  assert.match(sql, /create table if not exists public\.notification_deliveries/i);
  assert.match(sql, /dedupe_key text not null unique/i);
  assert.match(sql, /check \(status in \('pending', 'sent', 'failed', 'skipped'\)\)/i);
  assert.match(sql, /enable row level security/i);
});

test('desktop: tarefa só com canal desktop não gera aviso no servidor', () => {
  assert.deepEqual(notificationFromMeta({ alerts: [60], channels: ['desktop'] }, 'task'), { alerts: [60], channels: ['desktop'] });
  assert.deepEqual(channelList(['desktop']), ['desktop']);
  const item = { itemType: 'task' as const, id: 't1', userId: 'u1', title: 'Teste', anchorIso: '2026-10-31T15:00:00.000Z', alerts: [60], channels: ['desktop' as const] };
  assert.deepEqual(dueNotifications(item, 'America/Cuiaba', new Date('2026-10-31T15:30:00.000Z')), []);
});

test('desktop: canal desktop junto com push continua enviando o push', () => {
  const item = { itemType: 'task' as const, id: 't2', userId: 'u1', title: 'Teste', anchorIso: '2026-10-31T15:00:00.000Z', alerts: [60], channels: ['desktop' as const, 'push' as const] };
  const sent = dueNotifications(item, 'America/Cuiaba', new Date('2026-10-31T15:30:00.000Z'));
  assert.equal(sent.length, 1);
  assert.equal(sent[0]!.channel, 'push');
});
