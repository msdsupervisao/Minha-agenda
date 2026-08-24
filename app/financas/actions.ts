'use server';

import { revalidatePath } from 'next/cache';
import { getScreenContext, wallTimeToUtcIso } from '@/lib/data/screen-queries';
import { resolveTimezone } from '@/lib/data/server-timezone';

export type ActionResult = { ok: boolean; error?: string };

/** Edita valor, categoria e data de um gasto do próprio usuário (RLS reforça a posse). */
export async function updateExpense(
  id: string,
  input: { amount: number; category: string; occurredAt: string },
): Promise<ActionResult> {
  const ctx = await getScreenContext();
  if (!ctx) return { ok: false, error: 'Sessão expirada.' };

  const amount = Number(input.amount);
  const category = input.category.trim();
  if (!Number.isFinite(amount) || amount <= 0) return { ok: false, error: 'Informe um valor maior que zero.' };
  if (!category) return { ok: false, error: 'A categoria não pode ficar vazia.' };
  if (!input.occurredAt) return { ok: false, error: 'Data inválida.' };
  const occurredIso = wallTimeToUtcIso(input.occurredAt, await resolveTimezone());

  const { error } = await ctx.client.from('expenses')
    .update({ amount, category, occurred_at: occurredIso })
    .eq('id', id).eq('user_id', ctx.userId).is('deleted_at', null);
  if (error) return { ok: false, error: 'Não foi possível salvar o gasto.' };
  revalidatePath('/financas');
  revalidatePath('/hoje');
  return { ok: true };
}

/** Exclusão reversível (soft-delete): some das listas mas pode ser desfeita. */
export async function deleteExpense(id: string): Promise<ActionResult> {
  const ctx = await getScreenContext();
  if (!ctx) return { ok: false, error: 'Sessão expirada.' };
  const { error } = await ctx.client.from('expenses')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id).eq('user_id', ctx.userId).is('deleted_at', null);
  if (error) return { ok: false, error: 'Não foi possível excluir o gasto.' };
  revalidatePath('/financas');
  revalidatePath('/hoje');
  return { ok: true };
}

export async function restoreExpense(id: string): Promise<ActionResult> {
  const ctx = await getScreenContext();
  if (!ctx) return { ok: false, error: 'Sessão expirada.' };
  const { error } = await ctx.client.from('expenses')
    .update({ deleted_at: null })
    .eq('id', id).eq('user_id', ctx.userId);
  if (error) return { ok: false, error: 'Não foi possível restaurar o gasto.' };
  revalidatePath('/financas');
  revalidatePath('/hoje');
  return { ok: true };
}
