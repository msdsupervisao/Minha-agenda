import type { CalendarEvent, Recurrence, Reminder, Task } from '@/lib/assistant/types';
import { DISPLAY_TZ } from '@/lib/format';

export type AgendaKind = 'reminder' | 'task' | 'event';

export type AgendaItem = {
  id: string;
  kind: AgendaKind;
  title: string;
  at: string | null;
  endsAt: string | null;
  done: boolean;
  recurrence?: Recurrence | null;
};

export function buildAgendaItems(reminders: Reminder[], tasks: Task[], events: CalendarEvent[]): AgendaItem[] {
  const items: AgendaItem[] = [
    ...reminders.map((r): AgendaItem => ({ id: r.id, kind: 'reminder', title: r.title, at: r.dueAt, endsAt: null, done: r.notificationStatus === 'delivered', recurrence: r.recurrence ?? null })),
    ...tasks.map((t): AgendaItem => ({ id: t.id, kind: 'task', title: t.title, at: t.dueAt, endsAt: null, done: t.status === 'done' })),
    ...events.map((e): AgendaItem => ({ id: e.id, kind: 'event', title: e.title, at: e.startsAt, endsAt: e.endsAt, done: false })),
  ];
  return items.sort(compareByAt);
}

function compareByAt(a: AgendaItem, b: AgendaItem) {
  if (!a.at && !b.at) return 0;
  if (!a.at) return 1;
  if (!b.at) return -1;
  return a.at < b.at ? -1 : a.at > b.at ? 1 : 0;
}

function dayKey(iso: string, tz = DISPLAY_TZ) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso));
}

export type AgendaGroup = { key: string; label: string; items: AgendaItem[] };

/** Agrupa em Atrasado, Sem data, Hoje, Amanhã e dias seguintes. */
export function groupAgenda(items: AgendaItem[], now = new Date(), tz = DISPLAY_TZ): AgendaGroup[] {
  const todayKey = dayKey(now.toISOString(), tz);
  const tomorrowKey = dayKey(new Date(now.getTime() + 86400000).toISOString(), tz);
  const nowMs = now.getTime();

  const late: AgendaItem[] = [];
  const noDate: AgendaItem[] = [];
  const byDay = new Map<string, AgendaItem[]>();

  for (const item of items) {
    if (!item.at) { if (!item.done) noDate.push(item); continue; }
    if (!item.done && new Date(item.at).getTime() < nowMs && dayKey(item.at, tz) < todayKey) { late.push(item); continue; }
    const key = dayKey(item.at, tz);
    (byDay.get(key) || byDay.set(key, []).get(key)!).push(item);
  }

  const groups: AgendaGroup[] = [];
  if (late.length) groups.push({ key: 'late', label: 'Atrasado', items: late });
  for (const key of [...byDay.keys()].sort()) {
    const label = key === todayKey ? 'Hoje' : key === tomorrowKey ? 'Amanhã' : formatDayKey(key);
    groups.push({ key, label, items: byDay.get(key)! });
  }
  if (noDate.length) groups.push({ key: 'nodate', label: 'Sem data', items: noDate });
  return groups;
}

function formatDayKey(key: string) {
  const [y, m, d] = key.split('-');
  return `${d}/${m}/${y}`;
}

/** Seleção priorizada para a tela "Hoje": atenção → hoje → aguardando → depois. */
export function curateForToday(items: AgendaItem[], now = new Date(), tz = DISPLAY_TZ): AgendaGroup[] {
  const all = groupAgenda(items, now, tz);
  const todayKey = dayKey(now.toISOString(), tz);
  const late = all.find((g) => g.key === 'late');
  const today = all.find((g) => g.key === todayKey);
  const noDate = all.find((g) => g.key === 'nodate');
  const upcoming = all
    .filter((g) => g.key !== 'late' && g.key !== 'nodate' && g.key !== todayKey)
    .flatMap((g) => g.items)
    .slice(0, 8);

  const out: AgendaGroup[] = [];
  if (late) out.push({ key: 'late', label: 'Atenção · atrasados', items: late.items });
  if (today) out.push({ key: 'today', label: 'Hoje', items: today.items });
  if (noDate) out.push({ key: 'nodate', label: 'Aguardando data', items: noDate.items });
  if (upcoming.length) out.push({ key: 'depois', label: 'Depois', items: upcoming });
  return out;
}
