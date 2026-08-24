import { normalize } from './memory';
import { parseTime, combineDateTime } from './parsing';
import { appTimezone, tzOffsetMs } from '../data/time';
import type { Recurrence } from './types';

const WEEKDAYS: Record<string, number> = { domingo: 0, segunda: 1, terca: 2, quarta: 3, quinta: 4, sexta: 5, sabado: 6 };

/**
 * Detecta se um comando pede repetição: "todos os dias" (daily),
 * "toda semana"/"toda segunda" (weekly), "todo mês"/"todo dia 15" (monthly).
 * Recebe o texto original; normaliza internamente (sem acento, minúsculo).
 */
export function parseRecurrence(text: string): Recurrence | null {
  const c = normalize(text);
  // Mensal primeiro: "todo dia 15" é mensal, não diário.
  if (/\btod[oa]\s+dia\s+\d{1,2}\b/.test(c) || /\btodo\s+mes\b/.test(c) || /\btodos\s+os\s+meses\b/.test(c) || /\bmensalmente\b/.test(c)) return 'monthly';
  if (/\btodos?\s+os\s+dias\b/.test(c) || /\btod[oa]\s+dia\b/.test(c) || /\bdiariamente\b/.test(c) || /\bcada\s+dia\b/.test(c) || /\btodo\s+dia\s+(?:de\s+)?manha\b/.test(c)) return 'daily';
  if (/\btoda\s+semana\b/.test(c) || /\btodas\s+as\s+semanas\b/.test(c) || /\bsemanalmente\b/.test(c) || /\b(?:toda|todo|todas\s+as|todos\s+os)\s+(?:domingo|segunda|terca|quarta|quinta|sexta|sabado)s?(?:-feiras?)?\b/.test(c)) return 'weekly';
  return null;
}

/** Remove as expressões de repetição do título (texto original, tolera acento). */
export function stripRecurrence(text: string): string {
  return text
    .replace(/\btodos?\s+os\s+dias\b/gi, ' ')
    .replace(/\btod[oa]\s+dia(?:\s+\d{1,2})?\b/gi, ' ')
    .replace(/\bdiariamente\b/gi, ' ')
    .replace(/\bcada\s+dia\b/gi, ' ')
    .replace(/\btoda\s+semana\b/gi, ' ')
    .replace(/\btodas\s+as\s+semanas\b/gi, ' ')
    .replace(/\bsemanalmente\b/gi, ' ')
    .replace(/\btodo\s+m[êe]s\b/gi, ' ')
    .replace(/\btodos\s+os\s+meses\b/gi, ' ')
    .replace(/\bmensalmente\b/gi, ' ')
    .replace(/\b(?:toda|todo|todas\s+as|todos\s+os)\s+(?:domingo|segunda|ter[çc]a|quarta|quinta|sexta|s[áa]bado)s?(?:-feiras?)?\b/gi, ' ')
    .replace(/\s{2,}/g, ' ')
    .replace(/[,;\s]+$/g, '')
    .trim();
}

/**
 * Primeira ocorrência futura de um lembrete recorrente, no fuso do app.
 * Usa o horário informado (padrão 09:00 se ausente). Para semanal com dia da
 * semana citado, cai na próxima ocorrência desse dia.
 */
export function firstRecurringDue(freq: Recurrence, text: string, now = new Date(), tz = appTimezone()): string {
  const time = parseTime(text) ?? { hour: 9, minute: 0 };
  // "wall": Date cujos campos UTC representam a hora de parede no fuso do app.
  const wall = new Date(now.getTime() + tzOffsetMs(now, tz));
  const curMinutes = wall.getUTCHours() * 60 + wall.getUTCMinutes();
  const tgtMinutes = time.hour * 60 + time.minute;
  const clean = normalize(text);

  if (freq === 'daily') {
    if (tgtMinutes <= curMinutes) wall.setUTCDate(wall.getUTCDate() + 1);
  } else if (freq === 'weekly') {
    const weekday = Object.entries(WEEKDAYS).find(([name]) => new RegExp(`\\b${name}(?:-feira)?\\b`).test(clean))?.[1];
    if (weekday != null) {
      let delta = (weekday - wall.getUTCDay() + 7) % 7;
      if (delta === 0 && tgtMinutes <= curMinutes) delta = 7;
      wall.setUTCDate(wall.getUTCDate() + delta);
    } else if (tgtMinutes <= curMinutes) {
      wall.setUTCDate(wall.getUTCDate() + 7);
    }
  } else {
    const dayMatch = clean.match(/dia\s+(\d{1,2})\b/);
    const origDay = wall.getUTCDate();
    const day = dayMatch ? Math.min(Math.max(Number(dayMatch[1]), 1), 28) : origDay;
    const past = day < origDay || (day === origDay && tgtMinutes <= curMinutes);
    if (past) wall.setUTCMonth(wall.getUTCMonth() + 1, day);
    else wall.setUTCDate(day);
  }
  return combineDateTime(wall, time, tz);
}

/**
 * Próxima ocorrência depois que um lembrete recorrente dispara. Avança em passos
 * (dia/semana/mês) até passar de `now`, cobrindo casos em que o cron ficou parado.
 */
export function nextRecurringDue(dueAtIso: string, freq: Recurrence, now = new Date()): string {
  const d = new Date(dueAtIso);
  if (Number.isNaN(d.getTime())) return dueAtIso;
  let guard = 0;
  do {
    if (freq === 'daily') d.setUTCDate(d.getUTCDate() + 1);
    else if (freq === 'weekly') d.setUTCDate(d.getUTCDate() + 7);
    else d.setUTCMonth(d.getUTCMonth() + 1);
    guard += 1;
  } while (d.getTime() <= now.getTime() && guard < 600);
  return d.toISOString();
}

/** Lê a recorrência guardada no metadata jsonb do lembrete. */
export function recurrenceFromMeta(meta: unknown): Recurrence | null {
  if (meta && typeof meta === 'object' && 'recurrence' in meta) {
    const value = (meta as { recurrence?: unknown }).recurrence;
    if (value === 'daily' || value === 'weekly' || value === 'monthly') return value;
  }
  return null;
}
