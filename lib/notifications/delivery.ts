export const STALE_PENDING_MS = 10 * 60_000;

export function isStalePending(updatedAt: string | null | undefined, now = new Date(), maxAgeMs = STALE_PENDING_MS) {
  const timestamp = updatedAt ? new Date(updatedAt).getTime() : NaN;
  return !Number.isFinite(timestamp) || now.getTime() - timestamp > maxAgeMs;
}
