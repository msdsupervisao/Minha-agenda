import type { DueNotification, NotifiableItem } from './schedule';

export const STALE_PENDING_MS = 10 * 60_000;

export function isStalePending(updatedAt: string | null | undefined, now = new Date(), maxAgeMs = STALE_PENDING_MS) {
  const timestamp = updatedAt ? new Date(updatedAt).getTime() : NaN;
  return !Number.isFinite(timestamp) || now.getTime() - timestamp > maxAgeMs;
}

/** O registro só pode ser finalizado quando todos os avisos previstos foram entregues. */
export function reminderReadyToFinalize(item: NotifiableItem, due: readonly DueNotification[], delivered: ReadonlySet<string>, now = new Date()) {
  const anchor = Date.parse(item.anchorIso);
  if (item.itemType !== 'reminder' || !Number.isFinite(anchor) || anchor > now.getTime()) return false;
  const expected = due.filter((notification) => notification.itemType === 'reminder' && notification.itemId === item.id && notification.userId === item.userId && Date.parse(notification.anchorAt) === anchor);
  return expected.length > 0 && expected.every((notification) => delivered.has(notification.dedupeKey));
}
