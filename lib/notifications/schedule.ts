import { isValidTimeZone } from '@/lib/data/time';
import type { NotificationChannel } from '@/lib/assistant/types';

export type NotificationItemType = 'reminder' | 'event' | 'task';

export type NotifiableItem = {
  itemType: NotificationItemType;
  id: string;
  userId: string;
  title: string;
  anchorIso: string;
  alerts: number[];
  channels: NotificationChannel[];
};

export type DueNotification = {
  itemType: NotificationItemType;
  itemId: string;
  userId: string;
  title: string;
  channel: NotificationChannel;
  offsetMinutes: number;
  anchorAt: string;
  fireAt: string;
  timezone: string;
  dedupeKey: string;
};

/** Expande antecedências e canais em avisos cujo instante já chegou. */
export function dueNotifications(item: NotifiableItem, timezone: string, now = new Date()): DueNotification[] {
  if (!isValidTimeZone(timezone)) throw new Error(`Fuso horário inválido: ${timezone}`);
  const anchor = new Date(item.anchorIso);
  if (!item.id || !item.userId || !item.title || Number.isNaN(anchor.getTime())) return [];
  const offsets = [...new Set(item.alerts)].filter((offset) => Number.isInteger(offset) && offset >= 0).sort((a, b) => b - a);
  const channels = [...new Set(item.channels)];
  const output: DueNotification[] = [];
  for (const offsetMinutes of offsets) {
    const fire = new Date(anchor.getTime() - offsetMinutes * 60_000);
    if (fire.getTime() > now.getTime()) continue;
    for (const channel of channels) {
      if (channel !== 'push' && channel !== 'whatsapp') continue;
      output.push({
        itemType: item.itemType,
        itemId: item.id,
        userId: item.userId,
        title: item.title,
        channel,
        offsetMinutes,
        anchorAt: anchor.toISOString(),
        fireAt: fire.toISOString(),
        timezone,
        dedupeKey: `${item.itemType}:${item.id}:${anchor.toISOString()}:${offsetMinutes}:${channel}`,
      });
    }
  }
  return output;
}
