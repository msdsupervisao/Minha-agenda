export const BRIDGE_PRESENCE_TTL_MS = 45_000;

export function bridgeOnline(lastSeen: unknown, now = Date.now()): boolean {
  if (typeof lastSeen !== 'string') return false;
  const timestamp = Date.parse(lastSeen);
  return Number.isFinite(timestamp) && timestamp <= now + 5_000 && now - timestamp <= BRIDGE_PRESENCE_TTL_MS;
}
