// Utilidades de tempo/fuso puras e seguras para código server/client.

/** Fuso padrão quando não há um fuso explícito da requisição ou do navegador. */
export function appTimezone() {
  return process.env.APP_TIMEZONE || 'America/Cuiaba';
}

/** Fuso do navegador quando disponível; mantém um fallback determinístico no servidor. */
export function browserTimezone(fallback = appTimezone()) {
  if (typeof window === 'undefined') return fallback;
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || fallback;
  } catch {
    return fallback;
  }
}

/** true se o identificador IANA (ex.: "America/Sao_Paulo") for válido. */
export function isValidTimeZone(tz: string) {
  if (!tz) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** Deslocamento (ms) do fuso informado em relação ao UTC para o instante dado. */
export function tzOffsetMs(date: Date, tz: string) {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hour12: false, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  const parts = dtf.formatToParts(date).reduce<Record<string, string>>((acc, part) => {
    if (part.type !== 'literal') acc[part.type] = part.value;
    return acc;
  }, {});
  const asUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
  return asUtc - date.getTime();
}

/** Meia-noite local (no fuso do app) do dia de `date`, como instante UTC. */
export function zonedStartOfDay(date: Date, tz = appTimezone()) {
  const offset = tzOffsetMs(date, tz);
  const local = new Date(date.getTime() + offset);
  local.setUTCHours(0, 0, 0, 0);
  return new Date(local.getTime() - offset);
}

export function zonedEndOfDay(date: Date, tz = appTimezone()) {
  const start = zonedStartOfDay(date, tz);
  return new Date(start.getTime() + 24 * 60 * 60 * 1000);
}

export function zonedStartOfMonth(date: Date, tz = appTimezone()) {
  const offset = tzOffsetMs(date, tz);
  const local = new Date(date.getTime() + offset);
  local.setUTCDate(1);
  local.setUTCHours(0, 0, 0, 0);
  return new Date(local.getTime() - offset);
}

/** Converte um valor de `datetime-local` (hora de parede no fuso do app) para instante UTC ISO. */
export function wallTimeToUtcIso(wall: string, tz = appTimezone()) {
  const [datePart, timePart = '00:00'] = wall.split('T');
  const [y, m, d] = datePart.split('-').map(Number);
  const [hh, mm] = timePart.split(':').map(Number);
  const guess = new Date(Date.UTC(y, (m || 1) - 1, d || 1, hh || 0, mm || 0));
  const offset = tzOffsetMs(guess, tz);
  return new Date(guess.getTime() - offset).toISOString();
}

export type ExpenseFilter = 'today' | '7d' | 'month' | 'all';

export function normalizeExpenseFilter(value: string | undefined): ExpenseFilter {
  return value === 'today' || value === '7d' || value === 'month' || value === 'all' ? value : '7d';
}

export function expenseRangeStart(filter: ExpenseFilter, now = new Date(), tz = appTimezone()): Date | null {
  if (filter === 'today') return zonedStartOfDay(now, tz);
  if (filter === '7d') return new Date(zonedStartOfDay(now, tz).getTime() - 6 * 24 * 60 * 60 * 1000);
  if (filter === 'month') return zonedStartOfMonth(now, tz);
  return null;
}
