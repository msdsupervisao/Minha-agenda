'use server';

import { revalidatePath } from 'next/cache';
import { getScreenContext, wallTimeToUtcIso } from '@/lib/data/screen-queries';
import type { AgendaKind } from '@/lib/data/agenda';

export type ActionResult = { ok: boolean; error?: string };

const TABLE: Record<AgendaKind, 'reminders' | 'tasks' | 'events'> = {
  reminder: 'reminders', task: 'tasks', event: 'events',
};

function refresh() {
  revalidatePath('/agenda');
  revalidatePath('/hoje');
}

export async function updateAgendaItem(
  kind: AgendaKind,
  id: string,
  input: { title: string; at: string | null; endsAt?: string | null },
): Promise<ActionResult> {
  const ctx = await getScreenContext();
  if (!ctx) return { ok: false, error: 'Sessão expirada.' };
  const title = input.title.trim();
  if (!title) return { ok: false, error: 'O título não pode ficar vazio.' };

  let patch: Record<string, unknown>;
  if (kind === 'reminder') {
    if (!input.at) return { ok: false, error: 'Informe a data e a hora do lembrete.' };
    patch = { title, due_at: wallTimeToUtcIso(input.at) };
  } else if (kind === 'task') {
    patch = { title, due_at: input.at ? wallTimeToUtcIso(input.at) : null };
  } else {
    if (!input.at) return { ok: false, error: 'Informe a data e a hora do compromisso.' };
    const startsAt = wallTimeToUtcIso(input.at);
    const endsAt = input.endsAt ? wallTimeToUtcIso(input.endsAt) : null;
    if (endsAt && endsAt < startsAt) return { ok: false, error: 'O término não pode ser antes do início.' };
    patch = { title, starts_at: startsAt, ends_at: endsAt };
  }

  const { error } = await ctx.client.from(TABLE[kind]).update(patch)
    .eq('id', id).eq('user_id', ctx.userId).is('deleted_at', null);
  if (error) return { ok: false, error: 'Não foi possível salvar.' };
  refresh();
  return { ok: true };
}

export async function setAgendaDone(kind: AgendaKind, id: string, done: boolean): Promise<ActionResult> {
  const ctx = await getScreenContext();
  if (!ctx) return { ok: false, error: 'Sessão expirada.' };
  let patch: Record<string, unknown>;
  if (kind === 'reminder') patch = { notification_status: done ? 'delivered' : 'pending' };
  else if (kind === 'task') patch = { status: done ? 'done' : 'open' };
  else return { ok: false, error: 'Compromissos não têm conclusão.' };

  const { error } = await ctx.client.from(TABLE[kind]).update(patch)
    .eq('id', id).eq('user_id', ctx.userId).is('deleted_at', null);
  if (error) return { ok: false, error: 'Não foi possível atualizar.' };
  refresh();
  return { ok: true };
}

export async function deleteAgendaItem(kind: AgendaKind, id: string): Promise<ActionResult> {
  const ctx = await getScreenContext();
  if (!ctx) return { ok: false, error: 'Sessão expirada.' };
  const { error } = await ctx.client.from(TABLE[kind])
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id).eq('user_id', ctx.userId).is('deleted_at', null);
  if (error) return { ok: false, error: 'Não foi possível excluir.' };
  refresh();
  return { ok: true };
}

export async function restoreAgendaItem(kind: AgendaKind, id: string): Promise<ActionResult> {
  const ctx = await getScreenContext();
  if (!ctx) return { ok: false, error: 'Sessão expirada.' };
  const { error } = await ctx.client.from(TABLE[kind])
    .update({ deleted_at: null }).eq('id', id).eq('user_id', ctx.userId);
  if (error) return { ok: false, error: 'Não foi possível restaurar.' };
  refresh();
  return { ok: true };
}
