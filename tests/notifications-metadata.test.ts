import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { notificationFromMeta } from '../lib/data/supabase-memory-repository';
import { channelList } from '../lib/notifications/dispatch';

test('metadata: defaults preservam lembretes legados e dão 1 hora a eventos/tarefas', () => {
  assert.deepEqual(notificationFromMeta({}, 'reminder'), { alerts: [0], channels: ['push'] });
  assert.deepEqual(notificationFromMeta({}, 'event'), { alerts: [60], channels: ['push'] });
  assert.deepEqual(notificationFromMeta({ alerts: [1440, 60, 60], channels: ['whatsapp', 'push'] }, 'task'), { alerts: [1440, 60], channels: ['whatsapp', 'push'] });
});

test('metadata: canal inválido ou lista vazia cai em push', () => {
  assert.deepEqual(channelList(['email', 'push']), ['push']);
  assert.deepEqual(channelList([]), ['push']);
});

test('migration: deliveries têm chave única por disparo e status observável', () => {
  const sql = readFileSync(join(process.cwd(), 'supabase/migrations/20261025000100_notifications.sql'), 'utf8');
  assert.match(sql, /create table if not exists public\.notification_deliveries/i);
  assert.match(sql, /dedupe_key text not null unique/i);
  assert.match(sql, /check \(status in \('pending', 'sent', 'failed', 'skipped'\)\)/i);
  assert.match(sql, /enable row level security/i);
});
