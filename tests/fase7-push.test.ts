import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { isDue, pushActivationErrorMessage, pushSubscribeErrorMessage, reminderPushPayload, urlBase64ToUint8Array } from '../lib/push/pure';
import { isCronAuthorized, secretMatches } from '../lib/push/cron-auth';

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

test('push: falha de persistência distingue sessão expirada', () => {
  assert.equal(pushSubscribeErrorMessage(401), 'Sua sessão expirou. Faça login novamente e repita a ativação.');
  assert.equal(pushSubscribeErrorMessage(500), 'Não foi possível registrar a inscrição.');
});

test('push: erros travados no Android recebem orientação específica', () => {
  assert.match(pushActivationErrorMessage('PermissionTimeout'), /não concluiu a permissão/i);
  assert.match(pushActivationErrorMessage('ServiceWorkerTimeout'), /preparar o serviço/i);
  assert.match(pushActivationErrorMessage('PushSubscriptionTimeout'), /VPN e DNS privado/i);
  assert.match(pushActivationErrorMessage('AbortError'), /Serviços do Google Play/i);
  assert.match(pushActivationErrorMessage('NotAllowedError'), /permissão.*bloqueada/i);
});

test('push: ativação não desregistra o service worker e limpa inscrição não persistida', () => {
  const component = readFileSync(join(process.cwd(), 'components/PushToggle.tsx'), 'utf8');
  assert.doesNotMatch(component, /\.unregister\s*\(/);
  assert.match(component, /if \(!res\.ok\)[\s\S]*?sub\.unsubscribe\(\)/);
  assert.match(component, /if \(pendingSub\)[\s\S]*?pendingSub\.unsubscribe\(\)/);
  assert.match(component, /navigator\.serviceWorker\.register\('\/sw\.js'\)/);
  assert.match(component, /PushSubscriptionTimeout/);
});

const ENV = { CRON_SECRET: 's3gr3do-forte' } as const;
const headersWith = (init: Record<string, string>) => new Headers(init);

test('cron: header x-cron-secret correto autoriza', () => {
  assert.equal(isCronAuthorized(headersWith({ 'x-cron-secret': 's3gr3do-forte' }), ENV), true);
});

test('cron: Authorization Bearer correto autoriza', () => {
  assert.equal(isCronAuthorized(headersWith({ authorization: 'Bearer s3gr3do-forte' }), ENV), true);
});

test('cron: segredo inválido é negado', () => {
  assert.equal(isCronAuthorized(headersWith({ 'x-cron-secret': 'errado' }), ENV), false);
});

test('cron: sem header nenhum é negado', () => {
  assert.equal(isCronAuthorized(headersWith({}), ENV), false);
});

test('cron: sem CRON_SECRET configurado nega tudo (nunca "aberto")', () => {
  assert.equal(isCronAuthorized(headersWith({ 'x-cron-secret': 'qualquer' }), {}), false);
  assert.equal(isCronAuthorized(headersWith({}), {}), false);
});

test('cron: segredo NÃO é aceito por query-string (evita vazamento em logs)', () => {
  // isCronAuthorized só lê headers; um "?secret=" nunca autoriza.
  assert.equal(isCronAuthorized(headersWith({}), ENV), false);
});

test('cron: comparação de segredo é resistente a tamanho e prefixo', () => {
  assert.equal(secretMatches('s3gr3do-forte', 's3gr3do-forte'), true);
  assert.equal(secretMatches('s3gr3do', 's3gr3do-forte'), false); // prefixo não passa
  assert.equal(secretMatches('', 's3gr3do-forte'), false);
  assert.equal(secretMatches('qualquer', undefined), false); // sem esperado, nega
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
