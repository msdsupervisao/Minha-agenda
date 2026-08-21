import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { getAuthenticatedUser } from '@/lib/supabase/auth';
import {
  contactFromRow, eventFromRow, expenseFromRow, noteFromRow, reminderFromRow, taskFromRow,
} from '@/lib/data/supabase-memory-repository';
import type { CalendarEvent, Contact, Expense, Note, Reminder, Task } from '@/lib/assistant/types';

export type ScreenContext = { client: SupabaseClient; userId: string; email: string | null };

/** Sessão validada + client autenticado para uso em Server Components e Server Actions. */
export async function getScreenContext(): Promise<ScreenContext | null> {
  const user = await getAuthenticatedUser();
  if (!user) return null;
  return { client: createClient(), userId: user.id, email: user.email ?? null };
}

export function appTimezone() {
  return process.env.APP_TIMEZONE || 'America/Cuiaba';
}

/** Deslocamento (ms) do fuso informado em relação ao UTC para o instante dado. */
function tzOffsetMs(date: Date, tz: string) {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hour12: false, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  const parts = dtf.formatToParts(date).reduce<Record<string, string>>((acc, part) => {
    if (part.type !== 'literal') acc[part.type] = part.value;
    return acc;
  }, {});
  const asUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
  return asUtc - date.getTime();
}

/** Meia-noite local (no fuso do app) do dia de `date`, como instante UTC. */
export function zonedStartOfDay(date: Date, tz = appTimezone()) {
  const offset = tzOffsetMs(date, tz);
  const local = new Date(date.getTime() + offset);
  local.setUTCHours(0, 0, 0, 0);
  return new Date(local.getTime() - offset);
}

export function zonedEndOfDay(date: Date, tz = appTimezone()) {
  const start = zonedStartOfDay(date, tz);
  return new Date(start.getTime() + 24 * 60 * 60 * 1000);
}

/** Converte um valor de `datetime-local` (hora de parede no fuso do app) para instante UTC ISO. */
export function wallTimeToUtcIso(wall: string, tz = appTimezone()) {
  const [datePart, timePart = '00:00'] = wall.split('T');
  const [y, m, d] = datePart.split('-').map(Number);
  const [hh, mm] = timePart.split(':').map(Number);
  const guess = new Date(Date.UTC(y, (m || 1) - 1, d || 1, hh || 0, mm || 0));
  const offset = tzOffsetMs(guess, tz);
  return new Date(guess.getTime() - offset).toISOString();
}

export function zonedStartOfMonth(date: Date, tz = appTimezone()) {
  const offset = tzOffsetMs(date, tz);
  const local = new Date(date.getTime() + offset);
  local.setUTCDate(1);
  local.setUTCHours(0, 0, 0, 0);
  return new Date(local.getTime() - offset);
}

// ---------- Finanças ----------

export type ExpenseFilter = 'today' | '7d' | 'month' | 'all';

export function normalizeExpenseFilter(value: string | undefined): ExpenseFilter {
  return value === 'today' || value === '7d' || value === 'month' || value === 'all' ? value : '7d';
}

function expenseRangeStart(filter: ExpenseFilter, now = new Date()): Date | null {
  if (filter === 'today') return zonedStartOfDay(now);
  if (filter === '7d') return new Date(zonedStartOfDay(now).getTime() - 6 * 24 * 60 * 60 * 1000);
  if (filter === 'month') return zonedStartOfMonth(now);
  return null;
}

export async function listExpenses(
  ctx: ScreenContext,
  filter: ExpenseFilter = '7d',
  category: string | null = null,
): Promise<Expense[]> {
  let query = ctx.client.from('expenses').select('*')
    .eq('user_id', ctx.userId).is('deleted_at', null)
    .order('occurred_at', { ascending: false }).limit(300);
  const start = expenseRangeStart(filter);
  if (start) query = query.gte('occurred_at', start.toISOString());
  if (category) query = query.eq('category', category);
  const { data, error } = await query;
  if (error) throw new Error('load:expenses');
  return (data || []).map((row) => expenseFromRow(row as Record<string, unknown>));
}

/** Categorias distintas do usuário para montar o filtro. */
export async function expenseCategories(ctx: ScreenContext): Promise<string[]> {
  const { data, error } = await ctx.client.from('expenses').select('category')
    .eq('user_id', ctx.userId).is('deleted_at', null).limit(1000);
  if (error) throw new Error('load:expenses:categories');
  const set = new Set<string>();
  (data || []).forEach((row) => { const value = String((row as { category?: unknown }).category ?? '').trim(); if (value) set.add(value); });
  return [...set].sort((a, b) => a.localeCompare(b, 'pt-BR'));
}

// ---------- Agenda (lembretes, tarefas, eventos) ----------

export async function listReminders(ctx: ScreenContext): Promise<Reminder[]> {
  const { data, error } = await ctx.client.from('reminders').select('*')
    .eq('user_id', ctx.userId).is('deleted_at', null)
    .order('due_at', { ascending: true }).limit(300);
  if (error) throw new Error('load:reminders');
  return (data || []).map((row) => reminderFromRow(row as Record<string, unknown>));
}

export async function listTasks(ctx: ScreenContext): Promise<Task[]> {
  const { data, error } = await ctx.client.from('tasks').select('*')
    .eq('user_id', ctx.userId).is('deleted_at', null)
    .order('due_at', { ascending: true, nullsFirst: false }).order('created_at', { ascending: false }).limit(300);
  if (error) throw new Error('load:tasks');
  return (data || []).map((row) => taskFromRow(row as Record<string, unknown>));
}

export async function listEvents(ctx: ScreenContext): Promise<CalendarEvent[]> {
  const { data, error } = await ctx.client.from('events').select('*')
    .eq('user_id', ctx.userId).is('deleted_at', null)
    .order('starts_at', { ascending: true }).limit(300);
  if (error) throw new Error('load:events');
  return (data || []).map((row) => eventFromRow(row as Record<string, unknown>));
}

export type { Expense, Reminder, Task, CalendarEvent, Note, Contact };
export { reminderFromRow, taskFromRow, eventFromRow, noteFromRow, contactFromRow };
