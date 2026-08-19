import { normalize } from './memory';

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

export function parseDate(text: string, reference = new Date()) {
  const clean = normalize(text);
  const date = new Date(reference);
  if (clean.includes('depois de amanha')) date.setDate(date.getDate() + 2);
  else if (clean.includes('amanha')) date.setDate(date.getDate() + 1);
  else if (clean.includes('semana que vem') || clean.includes('proxima semana')) {
    const untilMonday = (8 - date.getDay()) % 7 || 7;
    date.setDate(date.getDate() + untilMonday);
  } else if (clean.includes('mes que vem') || clean.includes('proximo mes')) {
    date.setMonth(date.getMonth() + 1, 1);
  } else {
    const weekdays: Record<string, number> = { domingo: 0, segunda: 1, terca: 2, quarta: 3, quinta: 4, sexta: 5, sabado: 6 };
    const weekday = Object.entries(weekdays).find(([name]) => new RegExp(`\\b${name}(?:-feira)?\\b`).test(clean));
    if (weekday) {
      const delta = (weekday[1] - date.getDay() + 7) % 7 || 7;
      date.setDate(date.getDate() + delta);
    } else if (!clean.includes('hoje')) return null;
  }
  date.setHours(0, 0, 0, 0);
  return date;
}

export function parseTime(text: string) {
  const digits = normalize(text).match(/(?:as|a)\s+(\d{1,2})(?::|h)?(\d{2})?/i);
  if (digits) return { hour: Number(digits[1]), minute: Number(digits[2] || 0) };
  const clean = normalize(text);
  const word = Object.entries(units).find(([name, value]) => value <= 19 && new RegExp(`(?:as|a)\\s+${name}\\b`).test(clean));
  return word ? { hour: word[1], minute: 0 } : null;
}

export function combineDateTime(date: Date, time: { hour: number; minute: number } | null) {
  const result = new Date(date);
  result.setHours(time?.hour ?? 0, time?.minute ?? 0, 0, 0);
  return result.toISOString();
}

export function contactNameFrom(text: string) {
  const match = text.match(/(?:com|para|pro|pra)\s+(?:(?:o|a)\s+)?([\p{L}][\p{L}'-]*)(?=\s+(?:amanh|hoje|às|as|sobre|dizendo|que)|[.,!?]|$)/iu);
  const candidate = match?.[1] || null;
  if (!candidate || /^(?:o|a|os|as|um|uma|professor|professora|aluno|aluna)$/i.test(candidate)) return null;
  return candidate;
}
