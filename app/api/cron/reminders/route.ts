import { NextResponse } from 'next/server';
import { createServiceClient, serviceConfigured } from '@/lib/supabase/service';
import { isCronAuthorized } from '@/lib/push/cron-auth';
import { collectNotificationItems } from '@/lib/notifications/collect';
import { dueNotifications, type DueNotification } from '@/lib/notifications/schedule';
import { pushFallbackNotification, sendNotification } from '@/lib/notifications/dispatch';
import type { DispatchChannel } from '@/lib/notifications/schedule';
import { isStalePending, reminderReadyToFinalize } from '@/lib/notifications/delivery';
import { pushConfigured } from '@/lib/push/send';
import { nextRecurringDue } from '@/lib/assistant/recurrence';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type DeliveryStatus = 'pending' | 'sent' | 'failed' | 'skipped';
type StoredSubscription = { id: string; endpoint: string; p256dh: string; auth: string };

async function handle(request: Request) {
  if (!isCronAuthorized(request.headers)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!serviceConfigured()) return NextResponse.json({ error: 'not_configured' }, { status: 503 });

  const client = createServiceClient();
  const nowDate = new Date();
  const now = nowDate.toISOString();
  const cleanup = await cleanupExpired(client, now);
  let items;
  try {
    items = await collectNotificationItems(client, nowDate);
  } catch (error) {
    console.error('[minha-agenda:notifications]', JSON.stringify({ timestamp: now, operation: 'collect', result: 'error', error: error instanceof Error ? error.message : String(error) }));
    return NextResponse.json({ error: 'load' }, { status: 500 });
  }

  const itemByKey = new Map(items.map((item) => [`${item.itemType}:${item.id}`, item]));
  const due = items.flatMap((item) => dueNotifications(item, item.timezone, nowDate));
  const subscriptions = new Map<string, StoredSubscription[]>();
  const sent: Record<DispatchChannel, number> = { push: 0, whatsapp: 0, telegram: 0 };
  const failed: Record<DispatchChannel, number> = { push: 0, whatsapp: 0, telegram: 0 };
  const skipped: Record<DispatchChannel, number> = { push: 0, whatsapp: 0, telegram: 0 };
  let checked = 0;
  let reserved = 0;
  const delivered = new Set<string>();

  for (const notification of due) {
    checked += 1;
    const item = itemByKey.get(`${notification.itemType}:${notification.itemId}`);
    if (!item) continue;
    const result = await sendAndRecord(notification, item, client, nowDate, now, subscriptions, { sent, failed, skipped });
    if (result.processed) reserved += 1;
    if (result.ok || result.alreadySent) delivered.add(notification.dedupeKey);
    if ((notification.channel === 'whatsapp' || notification.channel === 'telegram') && result.processed && !result.ok) {
      // WhatsApp/Telegram são preferenciais quando escolhidos, mas nunca devem
      // deixar o item sem aviso: a tentativa de push usa sua própria chave idempotente.
      const fallback: DueNotification = pushFallbackNotification(notification);
      const fallbackResult = await sendAndRecord(fallback, item, client, nowDate, now, subscriptions, { sent, failed, skipped });
      if (fallbackResult.processed) reserved += 1;
      if (fallbackResult.ok || fallbackResult.alreadySent) delivered.add(notification.dedupeKey);
    }
  }

  await finalizeReminders(client, items, due, delivered, nowDate);
  return NextResponse.json({ ok: true, checked, reserved, sent, failed, skipped, pushConfigured: pushConfigured(), ...cleanup });
}

async function cleanupExpired(client: ReturnType<typeof createServiceClient>, now: string) {
  const { count: cleanedHandoffs, error: cleanupError } = await client.from('schedule_handoffs').delete({ count: 'exact' }).lt('expires_at', now);
  if (cleanupError) console.error('[minha-agenda:data]', JSON.stringify({ timestamp: now, operation: 'schedule_cleanup', result: 'error', error: cleanupError.message }));
  const { count: cleanedAgentApprovals, error: approvalCleanupError } = await client.from('agent_pending_approvals').delete({ count: 'exact' }).lt('expires_at', now);
  if (approvalCleanupError) console.error('[minha-agenda:data]', JSON.stringify({ timestamp: now, operation: 'agent_approval_cleanup', result: 'error', error: approvalCleanupError.message }));
  return { cleanedHandoffs: cleanedHandoffs ?? 0, cleanedAgentApprovals: cleanedAgentApprovals ?? 0 };
}

async function reserveDelivery(client: ReturnType<typeof createServiceClient>, notification: DueNotification, now: string) {
  const { error } = await client.from('notification_deliveries').insert({
    user_id: notification.userId,
    item_type: notification.itemType,
    item_id: notification.itemId,
    anchor_at: notification.anchorAt,
    offset_minutes: notification.offsetMinutes,
    channel: notification.channel,
    fire_at: notification.fireAt,
    dedupe_key: notification.dedupeKey,
    status: 'pending',
    updated_at: now,
  });
  if (!error) return { process: true, alreadySent: false };
  if (error.code !== '23505') {
    console.error('[minha-agenda:notifications]', JSON.stringify({ operation: 'reserve', error: error.message }));
    return { process: false, alreadySent: false };
  }
  const existing = await client.from('notification_deliveries').select('status,updated_at').eq('dedupe_key', notification.dedupeKey).maybeSingle();
  if (existing.error || !existing.data) return { process: false, alreadySent: false };
  if (existing.data.status === 'sent') return { process: false, alreadySent: true };
  if (existing.data?.status === 'pending') {
    if (!isStalePending(existing.data?.updated_at ? String(existing.data.updated_at) : null, new Date(now))) return { process: false, alreadySent: false };
  }
  const retry = await client.from('notification_deliveries').update({ status: 'pending', error: null, updated_at: now }).eq('dedupe_key', notification.dedupeKey).eq('status', existing.data.status).eq('updated_at', existing.data.updated_at).select('id').maybeSingle();
  return { process: !retry.error && Boolean(retry.data), alreadySent: false };
}

async function sendAndRecord(
  notification: DueNotification,
  item: Awaited<ReturnType<typeof collectNotificationItems>>[number],
  client: ReturnType<typeof createServiceClient>,
  nowDate: Date,
  now: string,
  subscriptions: Map<string, StoredSubscription[]>,
  counters: { sent: Record<DispatchChannel, number>; failed: Record<DispatchChannel, number>; skipped: Record<DispatchChannel, number> },
) {
  const reservation = await reserveDelivery(client, notification, now);
  if (!reservation.process) return { ok: false, skipped: true, processed: false, alreadySent: reservation.alreadySent };
  let userSubscriptions = subscriptions.get(notification.userId);
  if (!userSubscriptions && notification.channel === 'push') {
    const result = await client.from('push_subscriptions').select('id,endpoint,p256dh,auth').eq('user_id', notification.userId);
    userSubscriptions = (result.data || []) as StoredSubscription[];
    subscriptions.set(notification.userId, userSubscriptions);
  }
  const result = await sendNotification(notification, { subscriptions: userSubscriptions || [], contact: item.contact }, nowDate);
  for (const id of result.goneSubscriptionIds) await client.from('push_subscriptions').delete().eq('id', id);
  const status: DeliveryStatus = result.ok ? 'sent' : result.skipped ? 'skipped' : 'failed';
  const saved = await client.from('notification_deliveries').update({ status, error: result.error || null, sent_at: result.ok ? now : null, updated_at: now }).eq('dedupe_key', notification.dedupeKey);
  if (saved.error) {
    console.error('[minha-agenda:notifications]', JSON.stringify({ operation: 'record_delivery', error: saved.error.message }));
    counters.failed[notification.channel] += 1;
    return { ok: false, processed: false, alreadySent: false };
  }
  if (result.ok) counters.sent[notification.channel] += 1;
  else if (result.skipped) counters.skipped[notification.channel] += 1;
  else counters.failed[notification.channel] += 1;
  return { ...result, processed: true, alreadySent: false };
}

async function finalizeReminders(client: ReturnType<typeof createServiceClient>, items: Awaited<ReturnType<typeof collectNotificationItems>>, due: DueNotification[], delivered: ReadonlySet<string>, now: Date) {
  const dueByItem = new Map<string, DueNotification[]>();
  for (const notification of due) {
    if (notification.itemType !== 'reminder') continue;
    const key = `${notification.userId}:${notification.itemId}`;
    const group = dueByItem.get(key) || [];
    group.push(notification);
    dueByItem.set(key, group);
  }
  for (const item of items) {
    if (!reminderReadyToFinalize(item, dueByItem.get(`${item.userId}:${item.id}`) || [], delivered, now)) continue;
    if (item.recurrence) {
      const next = nextRecurringDue(item.anchorIso, item.recurrence, now);
      await client.from('reminders').update({ due_at: next, notified_at: null, notification_status: 'pending', updated_at: now.toISOString() }).eq('id', item.id).eq('user_id', item.userId).eq('due_at', item.anchorIso).is('notified_at', null);
    } else {
      await client.from('reminders').update({ notified_at: now.toISOString(), notification_status: 'delivered', updated_at: now.toISOString() }).eq('id', item.id).eq('user_id', item.userId).eq('due_at', item.anchorIso).is('notified_at', null);
    }
  }
}

export async function POST(request: Request) { return handle(request); }
export async function GET(request: Request) { return handle(request); }
