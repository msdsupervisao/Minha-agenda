import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { OPTIONS as redeemOptions, POST as redeemPost } from '../app/api/schedule/redeem/route';
import {
  buildScheduleDeepLinks,
  createScheduleHandoffCode,
  hashScheduleHandoffCode,
  isScheduleHandoffOriginAllowed,
  scheduleDueAtIssue,
  scheduleAuditExpiresAt,
  scheduleHandoffCorsHeaders,
  SCHEDULE_HANDOFF_CODE_PATTERN,
} from '../lib/schedule/handoff';
import { notificationIdForScheduleCode } from '../lib/schedule/notification-id';

test('handoff: código tem 128 bits em base64url e o banco recebe somente o hash', () => {
  const first = createScheduleHandoffCode();
  const second = createScheduleHandoffCode();
  assert.match(first, SCHEDULE_HANDOFF_CODE_PATTERN);
  assert.match(second, SCHEDULE_HANDOFF_CODE_PATTERN);
  assert.notEqual(first, second);
  assert.match(hashScheduleHandoffCode(first), /^[0-9a-f]{64}$/);
  assert.doesNotMatch(hashScheduleHandoffCode(first), new RegExp(first));
});

test('handoff: links abrem o app Android e o ID local é estável para retry', () => {
  const code = 'A'.repeat(22);
  assert.deepEqual(buildScheduleDeepLinks(code), {
    deepLink: `minhaagenda://schedule?code=${code}`,
    androidIntent: `intent://schedule?code=${code}#Intent;scheme=minhaagenda;package=com.minhaagenda.app;end`,
  });
  assert.equal(notificationIdForScheduleCode(code), notificationIdForScheduleCode(code));
  assert.notEqual(notificationIdForScheduleCode(code), notificationIdForScheduleCode('B'.repeat(22)));
  assert.ok(notificationIdForScheduleCode(code) > 0);
});

test('handoff: rejeita horário inválido ou passado e aceita horário futuro', () => {
  const now = Date.parse('2026-08-25T12:00:00Z');
  assert.match(scheduleDueAtIssue('inválido', now) || '', /inválidos/i);
  assert.match(scheduleDueAtIssue('2026-08-25T11:59:59Z', now) || '', /futuro/i);
  assert.equal(scheduleDueAtIssue('2026-08-25T12:00:01Z', now), null);
  assert.equal(scheduleAuditExpiresAt('2026-08-26T12:00:00Z', now), '2026-09-02T12:00:00.000Z');
});

test('handoff: CORS permite somente o app, a produção e localhost de desenvolvimento', () => {
  for (const origin of ['https://localhost', 'capacitor://localhost', 'https://minha-agenda1.vercel.app', 'http://localhost:5173']) {
    assert.equal(isScheduleHandoffOriginAllowed(origin), true);
    assert.equal(scheduleHandoffCorsHeaders(origin)['access-control-allow-origin'], origin);
  }
  assert.equal(isScheduleHandoffOriginAllowed('https://site-malicioso.example'), false);
  assert.equal(scheduleHandoffCorsHeaders('https://site-malicioso.example')['access-control-allow-origin'], undefined);
});

test('handoff: preflight real ecoa o app e a API rejeita origem externa antes do banco', async () => {
  const allowed = redeemOptions(new Request('https://minha-agenda1.vercel.app/api/schedule/redeem', {
    method: 'OPTIONS', headers: { origin: 'https://localhost' },
  }));
  assert.equal(allowed.status, 204);
  assert.equal(allowed.headers.get('access-control-allow-origin'), 'https://localhost');

  const blocked = await redeemPost(new Request('https://minha-agenda1.vercel.app/api/schedule/redeem', {
    method: 'POST',
    headers: { origin: 'https://site-malicioso.example', 'content-type': 'application/json' },
    body: JSON.stringify({ code: 'A'.repeat(22) }),
  }));
  assert.equal(blocked.status, 403);
});

test('handoff: migration usa hash, limites, RLS e retenção por expiração', () => {
  const sql = readFileSync(join(process.cwd(), 'supabase/migrations/20260824000400_phase8_schedule_handoff.sql'), 'utf8');
  assert.match(sql, /code_hash text not null unique/i);
  assert.doesNotMatch(sql, /\bcode text\b/i);
  assert.match(sql, /char_length\(body\) between 1 and 4000/i);
  assert.match(sql, /check \(due_at > created_at\)/i);
  assert.match(sql, /schedule_handoffs_expires_idx/i);
  assert.match(sql, /enable row level security/i);
  for (const operation of ['select', 'insert', 'delete']) assert.match(sql, new RegExp(`owner_${operation}`));
  assert.doesNotMatch(sql, /owner_update/i);
});

test('handoff: ACK persiste a evidência e o app agenda automaticamente ao abrir', () => {
  const redeem = readFileSync(join(process.cwd(), 'app/api/schedule/redeem/route.ts'), 'utf8');
  const ack = readFileSync(join(process.cwd(), 'app/api/schedule/ack/route.ts'), 'utf8');
  const mobile = readFileSync(join(process.cwd(), 'mobile/src/main.ts'), 'utf8');
  assert.doesNotMatch(redeem, /redeemed_at/);
  assert.match(redeem, /export function OPTIONS/);
  assert.match(ack, /status:\s*parsed\.data\.status/);
  assert.match(ack, /device_notification_id/);
  assert.doesNotMatch(ack, /\.delete\(\)\.eq\('code_hash'/);
  assert.match(mobile, /const handoff = await redeem\(code\)/);
  assert.match(mobile, /await scheduleLocal\(handoff, code\)/);
  assert.match(mobile, /notificationIdForScheduleCode\(code\)/);
  assert.match(mobile, /LocalNotifications\.schedule[\s\S]+await acknowledgeWithRetry\(code, id\)/);
  assert.match(mobile, /isExactNotification:\s*true/);
  assert.match(mobile, /AppLauncher\.openUrl/);
});

test('handoff: nova migration distingue pendência, sucesso no aparelho e falha', () => {
  const sql = readFileSync(join(process.cwd(), 'supabase/migrations/20260826000600_schedule_handoff_delivery_state.sql'), 'utf8');
  for (const status of ['awaiting_device', 'scheduled_on_device', 'failed']) assert.match(sql, new RegExp(status));
  assert.match(sql, /device_notification_id integer/i);
  assert.match(sql, /acknowledged_at timestamptz/i);
  assert.match(sql, /status = 'failed' and acknowledged_at is not null/i);
  assert.match(sql, /foreign key \(action_log_id, user_id\)/i);
  assert.match(sql, /status = 'unknown'/i);
});

test('handoff: ACK tardio de falha não rebaixa sucesso confirmado', () => {
  const ack = readFileSync(join(process.cwd(), 'app/api/schedule/ack/route.ts'), 'utf8');
  assert.match(ack, /neq\('status', 'scheduled_on_device'\)/);
  assert.match(ack, /stored: false, status: 'scheduled_on_device'/);
});

test('handoff: build Android exige endpoint explícito do ambiente', () => {
  const mobile = readFileSync(join(process.cwd(), 'mobile/src/main.ts'), 'utf8');
  const vite = readFileSync(join(process.cwd(), 'mobile/vite.config.ts'), 'utf8');
  assert.match(mobile, /import\.meta\.env\.VITE_API_BASE/);
  assert.doesNotMatch(mobile, /const API_BASE = 'https:\/\//);
  assert.match(vite, /VITE_API_BASE é obrigatória/);
});

test('handoff: Android registra deep link, alarme exato e protege o backup', () => {
  const manifest = readFileSync(join(process.cwd(), 'mobile/android/app/src/main/AndroidManifest.xml'), 'utf8');
  assert.match(manifest, /android\.permission\.SCHEDULE_EXACT_ALARM/);
  assert.match(manifest, /android:scheme="minhaagenda"\s+android:host="schedule"/);
  assert.match(manifest, /android:allowBackup="false"/);
  assert.match(manifest, /com\.whatsapp/);
  const icon = readFileSync(join(process.cwd(), 'mobile/android/app/src/main/res/drawable/ic_stat_icon.xml'), 'utf8');
  assert.match(icon, /<vector/);
});
