import type { SupabaseClient } from '@supabase/supabase-js';
import type { SchoolClass } from '@/lib/assistant/types';

export type ClassInput = {
  name: string;
  course: string | null;
  schedule: string | null;
  teacher: string | null;
  notes: string | null;
  whatsappGroup: string | null;
  noticeTemplateDirect: string | null;
  noticeTemplateMotivational: string | null;
  noticeTemplateImpactful: string | null;
};

export type ClassResult = { ok: boolean; error?: string };

function strOrNull(value: unknown) {
  return typeof value === 'string' && value.trim() ? value : null;
}

export function classFromRow(row: Record<string, unknown>): SchoolClass {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    name: String(row.name),
    course: strOrNull(row.course),
    schedule: strOrNull(row.schedule),
    teacher: strOrNull(row.teacher),
    notes: strOrNull(row.notes),
    whatsappGroup: strOrNull(row.whatsapp_group),
    noticeTemplateDirect: strOrNull(row.notice_template_direct),
    noticeTemplateMotivational: strOrNull(row.notice_template_motivational),
    noticeTemplateImpactful: strOrNull(row.notice_template_impactful),
  };
}

export function validateClassInput(input: ClassInput): string | null {
  if (!input.name.trim()) return 'O nome da turma não pode ficar vazio.';
  return null;
}

function toRow(input: ClassInput) {
  return {
    name: input.name.trim(),
    course: input.course?.trim() || null,
    schedule: input.schedule?.trim() || null,
    teacher: input.teacher?.trim() || null,
    notes: input.notes?.trim() || null,
    whatsapp_group: input.whatsappGroup?.trim() || null,
    notice_template_direct: input.noticeTemplateDirect?.trim() || null,
    notice_template_motivational: input.noticeTemplateMotivational?.trim() || null,
    notice_template_impactful: input.noticeTemplateImpactful?.trim() || null,
  };
}

export async function listClasses(client: SupabaseClient, userId: string): Promise<SchoolClass[]> {
  const { data, error } = await client.from('classes').select('*')
    .eq('user_id', userId).order('created_at', { ascending: false }).limit(300);
  if (error) throw new Error('load:classes');
  return (data || []).map((row) => classFromRow(row as Record<string, unknown>));
}

export async function createClass(client: SupabaseClient, userId: string, input: ClassInput): Promise<ClassResult> {
  const invalid = validateClassInput(input);
  if (invalid) return { ok: false, error: invalid };
  const { error } = await client.from('classes').insert({ user_id: userId, ...toRow(input) });
  if (error) return { ok: false, error: 'Não foi possível criar a turma.' };
  return { ok: true };
}

export async function updateClass(client: SupabaseClient, userId: string, id: string, input: ClassInput): Promise<ClassResult> {
  const invalid = validateClassInput(input);
  if (invalid) return { ok: false, error: invalid };
  const { error } = await client.from('classes').update(toRow(input)).eq('id', id).eq('user_id', userId);
  if (error) return { ok: false, error: 'Não foi possível salvar a turma.' };
  return { ok: true };
}

export async function deleteClass(client: SupabaseClient, userId: string, id: string): Promise<ClassResult> {
  const { error } = await client.from('classes').delete().eq('id', id).eq('user_id', userId);
  if (error) return { ok: false, error: 'Não foi possível excluir a turma.' };
  return { ok: true };
}
