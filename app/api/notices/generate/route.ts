import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getAiRuntimeConfig } from '@/lib/assistant/ai-config';
import { getAuthenticatedUser } from '@/lib/supabase/auth';
import { createClient } from '@/lib/supabase/server';
import {
  generateNoticeVariants,
  type GeneratedNotices,
  type NoticeGenerationHistoryEntry,
} from '@/lib/notices/ai-generator';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const RequestSchema = z.object({ classId: z.string().uuid() }).strict();

export async function POST(request: Request) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: 'Sessão expirada. Entre novamente.' }, { status: 401 });

  let payload: unknown;
  try { payload = await request.json(); }
  catch { return NextResponse.json({ error: 'Pedido inválido.' }, { status: 400 }); }
  const parsed = RequestSchema.safeParse(payload);
  if (!parsed.success) return NextResponse.json({ error: 'Turma inválida.' }, { status: 400 });

  const config = getAiRuntimeConfig();
  if (config.activeProvider !== 'openai' || !config.apiKey) {
    return NextResponse.json({ error: 'A geração por IA não está configurada.' }, { status: 503 });
  }

  const client = await createClient();
  const { data: schoolClass, error: loadError } = await client.from('classes')
    .select('id,name,course,teacher,schedule,notice_template_direct,notice_template_motivational,notice_template_impactful,notice_generation_history')
    .eq('id', parsed.data.classId).eq('user_id', user.id).maybeSingle();
  if (loadError) return NextResponse.json({ error: 'Não foi possível carregar os modelos.' }, { status: 500 });
  if (!schoolClass) return NextResponse.json({ error: 'Turma não encontrada.' }, { status: 404 });

  const current: GeneratedNotices = {
    direct: String(schoolClass.notice_template_direct || '').trim(),
    motivational: String(schoolClass.notice_template_motivational || '').trim(),
    impactful: String(schoolClass.notice_template_impactful || '').trim(),
  };
  if (Object.values(current).some((message) => !message)) {
    return NextResponse.json({ error: 'Preencha e salve os três modelos antes de pedir novas versões.' }, { status: 409 });
  }

  const history = noticeHistory(schoolClass.notice_generation_history);
  try {
    const generated = await generateNoticeVariants({
      className: String(schoolClass.name),
      course: stringOrNull(schoolClass.course),
      teacher: stringOrNull(schoolClass.teacher),
      schedule: stringOrNull(schoolClass.schedule),
      current,
      history,
    }, {
      apiKey: config.apiKey,
      model: config.model,
      timeoutMs: Math.max(config.timeoutMs, 15000),
    });
    const entry: NoticeGenerationHistoryEntry = { ...generated.notices, generatedAt: new Date().toISOString() };
    const nextHistory = [...history, entry].slice(-8);
    const { error: updateError } = await client.from('classes').update({ notice_generation_history: nextHistory })
      .eq('id', parsed.data.classId).eq('user_id', user.id);
    if (updateError) throw new Error('history_update_failed');
    return NextResponse.json({ models: generated.notices }, { headers: { 'cache-control': 'no-store' } });
  } catch (error) {
    console.error('[minha-agenda:notice-ai]', JSON.stringify({
      timestamp: new Date().toISOString(),
      classId: parsed.data.classId,
      result: 'error',
      error: error instanceof Error ? error.message : 'unknown',
    }));
    return NextResponse.json({ error: 'A IA não conseguiu criar novas versões agora. Tente novamente.' }, { status: 502 });
  }
}

function noticeHistory(value: unknown): NoticeGenerationHistoryEntry[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is NoticeGenerationHistoryEntry => {
    if (!entry || typeof entry !== 'object') return false;
    const item = entry as Record<string, unknown>;
    return ['direct', 'motivational', 'impactful', 'generatedAt'].every((key) => typeof item[key] === 'string');
  }).slice(-8);
}

function stringOrNull(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}
