import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { getAuthenticatedUser } from '@/lib/supabase/auth';
import {
  contactFromRow, eventFromRow, expenseFromRow, noteFromRow, reminderFromRow, taskFromRow,
} from '@/lib/data/supabase-memory-repository';
import type { CalendarEvent, Contact, Expense, Note, Reminder, Task } from '@/lib/assistant/types';
import {
  expenseRangeStart, normalizeExpenseFilter, wallTimeToUtcIso,
  zonedEndOfDay, zonedStartOfDay, zonedStartOfMonth, appTimezone, type ExpenseFilter,
} from '@/lib/data/time';

export type ScreenContext = { client: SupabaseClient; userId: string; email: string | null };

/** Sessão validada + client autenticado para uso em Server Components e Server Actions. */
export async function getScreenContext(): Promise<ScreenContext | null> {
  const user = await getAuthenticatedUser();
  if (!user) return null;
  return { client: await createClient(), userId: user.id, email: user.email ?? null };
}

// Reexporta utilidades de tempo/filtro para páginas e server actions.
export {
  appTimezone, normalizeExpenseFilter, wallTimeToUtcIso,
  zonedStartOfDay, zonedEndOfDay, zonedStartOfMonth, type ExpenseFilter,
};

// ---------- Finanças ----------

export async function listExpenses(
  ctx: ScreenContext,
  filter: ExpenseFilter = '7d',
  category: string | null = null,
  tz?: string,
): Promise<Expense[]> {
  let query = ctx.client.from('expenses').select('*')
    .eq('user_id', ctx.userId).is('deleted_at', null)
    .order('occurred_at', { ascending: false }).limit(300);
  const start = expenseRangeStart(filter, new Date(), tz ?? appTimezone());
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
