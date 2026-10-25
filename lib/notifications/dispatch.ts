import type { Contact, NotificationChannel } from '@/lib/assistant/types';
import { sendCloudWhatsAppNotification } from '@/lib/assistant/whatsapp-cloud';
import { notificationPushPayload } from '@/lib/push/pure';
import { pushConfigured, sendPush, type PushSub } from '@/lib/push/send';
import type { DueNotification } from './schedule';

export type DispatchTarget = {
  subscriptions: Array<PushSub & { id: string }>;
  contact: Pick<Contact, 'phone' | 'whatsappOptIn' | 'lastInboundAt'> | null;
};

export type DispatchResult = {
  ok: boolean;
  skipped?: boolean;
  goneSubscriptionIds: string[];
  error?: string;
};

export async function sendNotification(notification: DueNotification, target: DispatchTarget, now = new Date()): Promise<DispatchResult> {
  if (notification.channel === 'push') return sendPushNotification(notification, target.subscriptions);
  const result = await sendCloudWhatsAppNotification(target.contact, notification.title, now, fetch, [notification.title, formatAnchor(notification.anchorAt, notification.timezone)]);
  return { ok: result.ok, skipped: result.skipped, goneSubscriptionIds: [], error: result.error };
}

function formatAnchor(iso: string, timezone: string) {
  return new Intl.DateTimeFormat('pt-BR', { timeZone: timezone, dateStyle: 'short', timeStyle: 'short' }).format(new Date(iso));
}

async function sendPushNotification(notification: DueNotification, subscriptions: DispatchTarget['subscriptions']): Promise<DispatchResult> {
  if (!pushConfigured()) return { ok: false, goneSubscriptionIds: [], error: 'push_not_configured' };
  if (!subscriptions.length) return { ok: false, skipped: true, goneSubscriptionIds: [], error: 'push_subscription_missing' };
  const payload = notificationPushPayload(notification.itemType, notification.title, notification.itemId, notification.offsetMinutes);
  let ok = false;
  const goneSubscriptionIds: string[] = [];
  for (const subscription of subscriptions) {
    const result = await sendPush(subscription, payload);
    ok ||= result.ok;
    if (result.gone) goneSubscriptionIds.push(subscription.id);
  }
  return { ok, goneSubscriptionIds, error: ok ? undefined : 'push_delivery_failed' };
}

export function channelList(value: unknown): NotificationChannel[] {
  if (!Array.isArray(value)) return ['push'];
  const channels = [...new Set(value.filter((item): item is NotificationChannel => item === 'push' || item === 'whatsapp'))];
  return channels.length ? channels : ['push'];
}
