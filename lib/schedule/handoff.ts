import { createHash, randomBytes } from 'node:crypto';

export const SCHEDULE_HANDOFF_TTL_MS = 30 * 60 * 1000;
export const SCHEDULE_HANDOFF_CODE_PATTERN = /^[A-Za-z0-9_-]{22}$/;

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
