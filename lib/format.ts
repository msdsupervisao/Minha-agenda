// Formatação de exibição. O fuso padrão espelha APP_TIMEZONE do .env
// (o cliente não lê variáveis de servidor, então usamos a mesma constante).
export const DISPLAY_TZ = 'America/Cuiaba';

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

export function formatBRL(value: number) {
  return brl.format(Number.isFinite(value) ? value : 0);
}

function parts(iso: string, tz: string) {
  const date = new Date(iso);
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: tz, day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(date).reduce<Record<string, string>>((acc, part) => {
    if (part.type !== 'literal') acc[part.type] = part.value;
    return acc;
  }, {});
}

export function formatDateTime(iso: string, tz = DISPLAY_TZ) {
  const p = parts(iso, tz);
  return `${p.day}/${p.month} · ${p.hour}:${p.minute}`;
}

export function formatDate(iso: string, tz = DISPLAY_TZ) {
  const p = parts(iso, tz);
  return `${p.day}/${p.month}/${p.year}`;
}

export function formatTime(iso: string, tz = DISPLAY_TZ) {
  const p = parts(iso, tz);
  return `${p.hour}:${p.minute}`;
}

/** UTC ISO -> valor "YYYY-MM-DDThh:mm" (hora de parede) para inputs datetime-local. */
export function toDatetimeLocal(iso: string, tz = DISPLAY_TZ) {
  const p = parts(iso, tz);
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}

/** Rótulo amigável de dia relativo ("Hoje", "Amanhã", "Ontem" ou a data). */
export function relativeDayLabel(iso: string, tz = DISPLAY_TZ, now = new Date()) {
  const key = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
  const target = key(new Date(iso));
  const today = key(now);
  const tomorrow = key(new Date(now.getTime() + 86400000));
  const yesterday = key(new Date(now.getTime() - 86400000));
  if (target === today) return 'Hoje';
  if (target === tomorrow) return 'Amanhã';
  if (target === yesterday) return 'Ontem';
  return formatDate(iso, tz);
}
