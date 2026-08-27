import { createHash, randomBytes } from 'node:crypto';

export const SCHEDULE_HANDOFF_TTL_MS = 30 * 60 * 1000;
export const SCHEDULE_HANDOFF_AUDIT_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
export const SCHEDULE_HANDOFF_CODE_PATTERN = /^[A-Za-z0-9_-]{22}$/;

export type ScheduleHandoffStatus = 'awaiting_device' | 'scheduled_on_device' | 'failed';

const MOBILE_ORIGINS = new Set([
  'capacitor://localhost',
  'https://localhost',
  'http://localhost',
  'https://minha-agenda1.vercel.app',
]);

export function createScheduleHandoffCode() {
  return randomBytes(16).toString('base64url');
}

export function hashScheduleHandoffCode(code: string) {
  return createHash('sha256').update(code, 'utf8').digest('hex');
}

export function buildScheduleDeepLinks(code: string) {
  if (!SCHEDULE_HANDOFF_CODE_PATTERN.test(code)) throw new Error('invalid_schedule_handoff_code');
  return {
    deepLink: `minhaagenda://schedule?code=${code}`,
    androidIntent: `intent://schedule?code=${code}#Intent;scheme=minhaagenda;package=com.minhaagenda.app;end`,
  };
}

export function scheduleAuditExpiresAt(dueAt: string, now = Date.now()) {
  const dueTime = Date.parse(dueAt);
  const base = Number.isFinite(dueTime) ? Math.max(dueTime, now) : now;
  return new Date(base + SCHEDULE_HANDOFF_AUDIT_RETENTION_MS).toISOString();
}

export function scheduleDueAtIssue(value: string, now = Date.now()): string | null {
  const dueAt = Date.parse(value);
  if (!Number.isFinite(dueAt)) return 'Data e horário inválidos.';
  if (dueAt <= now) return 'Escolha um horário futuro.';
  return null;
}

export function isScheduleHandoffOriginAllowed(origin: string | null) {
  if (!origin) return true;
  if (MOBILE_ORIGINS.has(origin)) return true;
  return /^http:\/\/localhost:\d+$/.test(origin);
}

export function scheduleHandoffCorsHeaders(origin: string | null) {
  const headers: Record<string, string> = {
    'access-control-allow-headers': 'content-type',
    'access-control-allow-methods': 'POST, OPTIONS',
    'access-control-max-age': '86400',
    'cache-control': 'no-store',
    vary: 'Origin',
  };
  if (origin && isScheduleHandoffOriginAllowed(origin)) headers['access-control-allow-origin'] = origin;
  return headers;
}
