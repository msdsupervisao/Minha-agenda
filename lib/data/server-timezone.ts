// Resolve o fuso do dispositivo a partir do cookie gravado pelo cliente
// (ver components/TimezoneSync.tsx). Cai no fuso padrão do app se ausente ou
// inválido. Assíncrono porque `cookies()` do Next 16 retorna Promise.
import { cookies } from 'next/headers';
import { appTimezone, isValidTimeZone } from './time';

export const TZ_COOKIE = 'tz';

export async function resolveTimezone(): Promise<string> {
  const value = (await cookies()).get(TZ_COOKIE)?.value;
  return value && isValidTimeZone(value) ? value : appTimezone();
}
