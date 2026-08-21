'use server';

import { revalidatePath } from 'next/cache';
import { getScreenContext } from '@/lib/data/screen-queries';
import { createClass, deleteClass, updateClass, type ClassInput, type ClassResult } from '@/lib/data/classes-repository';

export async function createClassAction(input: ClassInput): Promise<ClassResult> {
  const ctx = await getScreenContext();
  if (!ctx) return { ok: false, error: 'Sessão expirada.' };
  const result = await createClass(ctx.client, ctx.userId, input);
  if (result.ok) revalidatePath('/turmas');
  return result;
}

export async function updateClassAction(id: string, input: ClassInput): Promise<ClassResult> {
  const ctx = await getScreenContext();
  if (!ctx) return { ok: false, error: 'Sessão expirada.' };
  const result = await updateClass(ctx.client, ctx.userId, id, input);
  if (result.ok) revalidatePath('/turmas');
  return result;
}

export async function deleteClassAction(id: string): Promise<ClassResult> {
  const ctx = await getScreenContext();
  if (!ctx) return { ok: false, error: 'Sessão expirada.' };
  const result = await deleteClass(ctx.client, ctx.userId, id);
  if (result.ok) revalidatePath('/turmas');
  return result;
}
