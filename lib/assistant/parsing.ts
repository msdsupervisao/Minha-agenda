import { normalize } from './memory';
import { appTimezone, tzOffsetMs, wallTimeToUtcIso } from '../data/time';

const pad = (n: number) => String(n).padStart(2, '0');

const units: Record<string, number> = { zero: 0, um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5, seis: 6, sete: 7, oito: 8, nove: 9, dez: 10, onze: 11, doze: 12, treze: 13, quatorze: 14, catorze: 14, quinze: 15, dezesseis: 16, dezessete: 17, dezoito: 18, dezenove: 19 };
const tens: Record<string, number> = { vinte: 20, trinta: 30, quarenta: 40, cinquenta: 50, sessenta: 60, setenta: 70, oitenta: 80, noventa: 90 };
const hundreds: Record<string, number> = { cem: 100, cento: 100, duzentos: 200, trezentos: 300, quatrocentos: 400, quinhentos: 500, seiscentos: 600, setecentos: 700, oitocentos: 800, novecentos: 900 };

export function parseNumber(value: string): number | null {
  const numeric = Number(value.replace(/\./g, '').replace(',', '.').replace(/[^\d.-]/g, ''));
  if (/\d/.test(value) && Number.isFinite(numeric)) return numeric;
  const words = normalize(value).split(/\s+/).filter((word) => word !== 'e' && word !== 'reais' && word !== 'real');
  let total = 0;
  let found = false;
  for (const word of words) {
    if (word in units) { total += units[word]; found = true; }
    else if (word in tens) { total += tens[word]; found = true; }
    else if (word in hundreds) { total += hundreds[word]; found = true; }
  }
  return found ? total : null;
}

export function extractAmount(text: string) {
  const numeric = text.match(/(?:r\$\s*)?([\d]+(?:[.,][\d]{1,2})?)(?:\s*reais?)?/i);
  if (numeric) return { amount: parseNumber(numeric[1]), raw: numeric[0] };
  const wordMatch = normalize(text).match(/\b((?:(?:cento|cem|duzentos|trezentos|quatrocentos|quinhentos|seiscentos|setecentos|oitocentos|novecentos|vinte|trinta|quarenta|cinquenta|sessenta|setenta|oitenta|noventa|um|uma|dois|duas|tres|quatro|cinco|seis|sete|oito|nove|dez|onze|doze|treze|catorze|quatorze|quinze|dezesseis|dezessete|dezoito|dezenove)(?:\s+e\s+)?)+)(?:\s+reais?)?/i);
  return wordMatch ? { amount: parseNumber(wordMatch[1]), raw: wordMatch[0] } : { amount: null, raw: '' };
}

/**
 * Interpreta datas relativas no FUSO DO APP (não no relógio do servidor, que
 * em produção é UTC). `date` retornado carrega a data de parede nos campos UTC
 * (meia-noite local), para ser convertido em instante por combineDateTime.
 */
export function parseDate(text: string, reference = new Date(), tz = appTimezone()) {
  const clean = normalize(text);
  // "wall": Date cujos campos UTC representam a hora de parede no fuso do app.
  const date = new Date(reference.getTime() + tzOffsetMs(reference, tz));
  if (clean.includes('depois de amanha')) date.setUTCDate(date.getUTCDate() + 2);
  else if (clean.includes('amanha')) date.setUTCDate(date.getUTCDate() + 1);
  else if (clean.includes('semana que vem') || clean.includes('proxima semana')) {
    const untilMonday = (8 - date.getUTCDay()) % 7 || 7;
    date.setUTCDate(date.getUTCDate() + untilMonday);
  } else if (clean.includes('mes que vem') || clean.includes('proximo mes')) {
    date.setUTCMonth(date.getUTCMonth() + 1, 1);
  } else {
    const weekdays: Record<string, number> = { domingo: 0, segunda: 1, terca: 2, quarta: 3, quinta: 4, sexta: 5, sabado: 6 };
    const weekday = Object.entries(weekdays).find(([name]) => new RegExp(`\\b${name}(?:[\\s-]?feira)?\\b`).test(clean));
    if (weekday) {
      const delta = (weekday[1] - date.getUTCDay() + 7) % 7 || 7;
      date.setUTCDate(date.getUTCDate() + delta);
    } else if (!clean.includes('hoje')) return null;
  }
  date.setUTCHours(0, 0, 0, 0);
  return date;
}

// Tempo relativo a partir de agora: "daqui a 2 minutos", "em 5 min",
// "daqui a uma hora", "em meia hora". Retorna o instante já resolvido.
const RELATIVE_UNIT_MS: Record<string, number> = { segundo: 1000, minuto: 60_000, hora: 3_600_000, dia: 86_400_000, semana: 604_800_000 };
const RELATIVE_RE = /\b(?:daqui\s+a|daqui|em|dentro\s+de)\s+(\d+|meia|um|uma|dois|duas|tres|quatro|cinco|seis|sete|oito|nove|dez|onze|doze|treze|quatorze|catorze|quinze|vinte|trinta)\s*(segundos?|minutos?|min|horas?|h|dias?|semanas?)\b/u;

export function parseRelativeDateTime(text: string, now = new Date()): Date | null {
  const match = normalize(text).match(RELATIVE_RE);
  if (!match) return null;
  const unitKey = match[2].replace(/^min$/, 'minuto').replace(/^h$/, 'hora').replace(/s$/, '');
  const ms = RELATIVE_UNIT_MS[unitKey];
  if (!ms) return null;
  const qty = match[1] === 'meia' ? 0.5 : parseNumber(match[1]);
  if (qty == null || qty <= 0) return null;
  return new Date(now.getTime() + qty * ms);
}

/** Remove a expressão de tempo relativo do título (texto original, tolerante a acento). */
export function stripRelativeDateTime(text: string) {
  return text.replace(/\b(?:daqui\s+a|daqui|em|dentro\s+de)\s+(?:\d+|meia|um|uma|dois|duas|tr[êe]s|quatro|cinco|seis|sete|oito|nove|dez|onze|doze|treze|(?:c|qu)atorze|quinze|vinte|trinta)\s*(?:segundos?|minutos?|min|horas?|h|dias?|semanas?)\b/giu, ' ')
    .replace(/\s{2,}/g, ' ').trim();
}

export function parseTime(text: string) {
  const clean = normalize(text);
  const withPeriod = (hour: number, minute: number) => {
    if (clean.includes('da noite')) return { hour: hour === 12 ? 0 : hour < 12 ? hour + 12 : hour, minute };
    if (clean.includes('da tarde') && hour < 12) return { hour: hour + 12, minute };
    return { hour, minute };
  };
  const digits = clean.match(/(?:as|a)\s+(\d{1,2})(?::|h)?(\d{2})?/i);
  if (digits) return withPeriod(Number(digits[1]), Number(digits[2] || 0));
  const word = Object.entries(units).find(([name, value]) => value <= 19 && new RegExp(`(?:as|a)\\s+${name}\\b`).test(clean));
  return word ? withPeriod(word[1], 0) : null;
}

/**
 * Combina a data de parede (campos UTC) com o horário informado e converte para
 * instante UTC ISO respeitando o fuso do app. Assim "hoje às 9h" em Cuiabá vira
 * o instante correto, e não 9h UTC.
 */
export function combineDateTime(date: Date, time: { hour: number; minute: number } | null, tz = appTimezone()) {
  const wall = `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`
    + `T${pad(time?.hour ?? 0)}:${pad(time?.minute ?? 0)}`;
  return wallTimeToUtcIso(wall, tz);
}

export function contactNameFrom(text: string) {
  const match = text.match(/(?:com|para|pro|pra)\s+(?:(?:o|a)\s+)?([\p{L}][\p{L}'-]*)(?=\s+(?:amanh|hoje|às|as|sobre|dizendo|que)|[.,!?]|$)/iu);
  const candidate = match?.[1] || null;
  if (!candidate || /^(?:o|a|os|as|um|uma|professor|professora|aluno|aluna)$/i.test(candidate)) return null;
  return candidate;
}
