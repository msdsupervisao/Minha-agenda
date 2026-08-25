import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { OPTIONS as redeemOptions, POST as redeemPost } from '../app/api/schedule/redeem/route';
import {
  createScheduleHandoffCode,
  hashScheduleHandoffCode,
  isScheduleHandoffOriginAllowed,
  scheduleDueAtIssue,
  scheduleHandoffCorsHeaders,
  SCHEDULE_HANDOFF_CODE_PATTERN,
} from '../lib/schedule/handoff';

test('handoff: código tem 128 bits em base64url e o banco recebe somente o hash', () => {
  const first = createScheduleHandoffCode();
  const second = createScheduleHandoffCode();
  assert.match(first, SCHEDULE_HANDOFF_CODE_PATTERN);
  assert.match(second, SCHEDULE_HANDOFF_CODE_PATTERN);
  assert.notEqual(first, second);
  assert.match(hashScheduleHandoffCode(first), /^[0-9a-f]{64}$/);
  assert.doesNotMatch(hashScheduleHandoffCode(first), new RegExp(first));
});

test('handoff: rejeita horário inválido ou passado e aceita horário futuro', () => {
  const now = Date.parse('2026-08-25T12:00:00Z');
  assert.match(scheduleDueAtIssue('inválido', now) || '', /inválidos/i);
  assert.match(scheduleDueAtIssue('2026-08-25T11:59:59Z', now) || '', /futuro/i);
  assert.equal(scheduleDueAtIssue('2026-08-25T12:00:01Z', now), null);
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

test('handoff: resgate é repetível até o ACK e o app confirma somente após agendar', () => {
  const redeem = readFileSync(join(process.cwd(), 'app/api/schedule/redeem/route.ts'), 'utf8');
  const ack = readFileSync(join(process.cwd(), 'app/api/schedule/ack/route.ts'), 'utf8');
  const mobile = readFileSync(join(process.cwd(), 'mobile/src/main.ts'), 'utf8');
  assert.doesNotMatch(redeem, /redeemed_at/);
  assert.match(redeem, /export function OPTIONS/);
  assert.match(ack, /\.delete\(\)\.eq\('code_hash'/);
  assert.match(mobile, /LocalNotifications\.schedule[\s\S]+await acknowledge\(code\)/);
  assert.match(mobile, /isExactNotification:\s*true/);
  assert.match(mobile, /AppLauncher\.openUrl/);
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
