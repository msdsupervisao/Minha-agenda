// Resolve o fuso do dispositivo a partir do cookie gravado pelo cliente
// (ver components/TimezoneSync.tsx). Cai no fuso padrão do app se ausente ou
// inválido. Assíncrono porque `cookies()` do Next 16 retorna Promise.
import { cookies } from 'next/headers';
import { AsyncLocalStorage } from 'node:async_hooks';
import { appTimezone, isValidTimeZone } from './time';

export const TZ_COOKIE = 'tz';
const timezoneStorage = new AsyncLocalStorage<string>();

export function currentTimezone(fallback = appTimezone()) {
  const value = timezoneStorage.getStore();
  return value && isValidTimeZone(value) ? value : fallback;
}

export function withTimezone<T>(timezone: string, callback: () => T): T {
  const value = isValidTimeZone(timezone) ? timezone : appTimezone();
  return timezoneStorage.run(value, callback);
}

export async function resolveTimezone(): Promise<string> {
  const context = currentTimezone('');
  if (context) return context;
  const value = (await cookies()).get(TZ_COOKIE)?.value;
  const timezone = value && isValidTimeZone(value) ? value : appTimezone();
  timezoneStorage.enterWith(timezone);
  return timezone;
}
