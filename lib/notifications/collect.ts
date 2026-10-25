import type { SupabaseClient } from '@supabase/supabase-js';
import type { Contact, NotificationPreferences } from '@/lib/assistant/types';
import { NOTIFICATION_DEFAULTS, notificationFromMeta } from '@/lib/data/supabase-memory-repository';
import { recurrenceFromMeta } from '@/lib/assistant/recurrence';
import { appTimezone, isValidTimeZone } from '@/lib/data/time';
import type { NotifiableItem, NotificationItemType } from './schedule';

export type CollectedNotificationItem = NotifiableItem & {
  timezone: string;
  recurrence?: 'daily' | 'weekly' | 'monthly' | null;
  contact: Pick<Contact, 'phone' | 'whatsappOptIn' | 'lastInboundAt'> | null;
};

type Row = Record<string, unknown>;

export async function collectNotificationItems(client: SupabaseClient, now = new Date()): Promise<CollectedNotificationItem[]> {
  const [profiles, reminders, tasks, events] = await Promise.all([
    client.from('profiles').select('user_id,metadata'),
    client.from('reminders').select('id,user_id,title,due_at,contact_id,metadata').is('deleted_at', null).is('notified_at', null).gte('due_at', new Date(now.getTime() - 31 * 86400000).toISOString()).limit(5000),
    client.from('tasks').select('id,user_id,title,due_at,status,contact_id,metadata').is('deleted_at', null).eq('status', 'open').not('due_at', 'is', null).gte('due_at', new Date(now.getTime() - 31 * 86400000).toISOString()).limit(5000),
    client.from('events').select('id,user_id,title,starts_at,contact_id,metadata').is('deleted_at', null).gte('starts_at', new Date(now.getTime() - 31 * 86400000).toISOString()).limit(5000),
  ]);
  for (const result of [profiles, reminders, tasks, events]) if (result.error) throw new Error(`notification_collect_failed:${result.error.message}`);

  const profileTimezones = new Map<string, string>();
  for (const row of (profiles.data || []) as Row[]) {
    const metadata = objectValue(row.metadata);
    if (typeof metadata.timezone === 'string' && metadata.timezone.trim()) profileTimezones.set(String(row.user_id), metadata.timezone);
  }
  const rows: Array<{ type: NotificationItemType; row: Row; anchor: string }> = [
    ...(reminders.data || []).map((row) => ({ type: 'reminder' as const, row: row as Row, anchor: 'due_at' })),
    ...(tasks.data || []).map((row) => ({ type: 'task' as const, row: row as Row, anchor: 'due_at' })),
    ...(events.data || []).map((row) => ({ type: 'event' as const, row: row as Row, anchor: 'starts_at' })),
  ];
  const contactIds = [...new Set(rows.map(({ row }) => typeof row.contact_id === 'string' ? row.contact_id : '').filter(Boolean))];
  const contactsResult = contactIds.length
    ? await client.from('contacts').select('id,phone,whatsapp_opt_in,last_inbound_at').in('id', contactIds).is('deleted_at', null)
    : { data: [], error: null };
  if (contactsResult.error) throw new Error(`notification_contacts_failed:${contactsResult.error.message}`);
  const contacts = new Map<string, Pick<Contact, 'phone' | 'whatsappOptIn' | 'lastInboundAt'>>();
  for (const row of (contactsResult.data || []) as Row[]) contacts.set(String(row.id), { phone: stringOrNull(row.phone), whatsappOptIn: Boolean(row.whatsapp_opt_in), lastInboundAt: stringOrNull(row.last_inbound_at) });

  return rows.map(({ type, row, anchor }) => {
    const userId = String(row.user_id);
    const notification = notificationFromMeta(row.metadata, type);
    const anchorIso = String(row[anchor]);
    const timezone = profileTimezones.get(userId) || appTimezone();
    return {
      itemType: type,
      id: String(row.id),
      userId,
      title: String(row.title),
      anchorIso,
      alerts: notification.alerts,
      channels: notification.channels,
      timezone: isValidTimeZone(timezone) ? timezone : appTimezone(),
      recurrence: type === 'reminder' ? recurrenceFromMeta(row.metadata) : null,
      contact: typeof row.contact_id === 'string' ? contacts.get(row.contact_id) || null : null,
    };
  });
}

export function notificationPreferences(value: unknown, kind: NotificationItemType): NotificationPreferences {
  return notificationFromMeta(value, kind) || NOTIFICATION_DEFAULTS[kind];
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function stringOrNull(value: unknown) { return typeof value === 'string' && value.trim() ? value : null; }
