// Autorização do cron de lembretes — puro e testável, uso EXCLUSIVO server-side.
// O segredo só trafega em header (x-cron-secret ou Authorization: Bearer),
// nunca em query-string (evita vazar em logs de acesso, proxies e referrers).
import { timingSafeEqual } from 'node:crypto';

/** Comparação de tempo constante; falso se algum lado ausente ou de tamanho distinto. */
export function secretMatches(provided: string | null | undefined, expected: string | undefined): boolean {
  if (!expected || !provided) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

type HeaderBag = { get(name: string): string | null };

export function isCronAuthorized(
  headers: HeaderBag,
  env: Readonly<Record<string, string | undefined>> = process.env,
): boolean {
  const expected = env.CRON_SECRET;
  if (!expected) return false; // sem segredo configurado, nega tudo
  const header = headers.get('x-cron-secret');
  const bearer = headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? null;
  return secretMatches(header, expected) || secretMatches(bearer, expected);
}
