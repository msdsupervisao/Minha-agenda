import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { isDue, reminderPushPayload, urlBase64ToUint8Array } from '../lib/push/pure';

const VAPID_PUBLIC = 'BMIU287pOgC0Y044cT0cQtaiT5Q1OX4T5eI_7ehuHIqULsW3yxiX39IaLU-O1F89p8CdcJkPj-p7jPC0r3-NW9w';

test('push: chave VAPID base64url vira ponto P-256 de 65 bytes', () => {
  const bytes = urlBase64ToUint8Array(VAPID_PUBLIC);
  assert.equal(bytes.length, 65);
  assert.equal(bytes[0], 0x04); // ponto não comprimido
});

test('push: payload do lembrete leva título e link da agenda', () => {
  const payload = reminderPushPayload('pagar a conta', 'abc');
  assert.deepEqual(payload, { title: 'Lembrete', body: 'pagar a conta', url: '/agenda', tag: 'rem-abc' });
});

test('push: isDue compara pelo instante', () => {
  const now = new Date('2026-08-21T12:00:00Z');
  assert.equal(isDue('2026-08-21T11:59:00Z', now), true);
  assert.equal(isDue('2026-08-21T12:00:00Z', now), true);
  assert.equal(isDue('2026-08-21T12:01:00Z', now), false);
});

test('push: migration cria push_subscriptions, notified_at, RLS e índices', () => {
  const sql = readFileSync(join(process.cwd(), 'supabase/migrations/20260821000300_phase7_push.sql'), 'utf8');
  assert.match(sql, /add column if not exists notified_at/i);
  assert.match(sql, /create table public\.push_subscriptions/i);
  for (const column of ['endpoint', 'p256dh', 'auth', 'user_id']) assert.match(sql, new RegExp(`\\b${column}\\b`));
  assert.match(sql, /enable row level security/i);
  for (const operation of ['select', 'insert', 'update', 'delete']) assert.match(sql, new RegExp(`owner_${operation}`));
  assert.match(sql, /reminders_due_notify_idx/i);
  assert.match(sql, /push_subscriptions_user_idx/i);
});
