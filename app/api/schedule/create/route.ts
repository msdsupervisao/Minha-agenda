import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSupabasePublicConfig } from '@/lib/supabase/config';
import { getAuthenticatedUser } from '@/lib/supabase/auth';
import { createClient } from '@/lib/supabase/server';
import {
  buildScheduleDeepLinks,
  createScheduleHandoffCode,
  hashScheduleHandoffCode,
  scheduleDueAtIssue,
  SCHEDULE_HANDOFF_TTL_MS,
} from '@/lib/schedule/handoff';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CreateSchema = z.object({
  body: z.string().trim().min(1).max(4000),
  recipientName: z.string().trim().max(200).nullish(),
  phone: z.string().trim().max(40).nullish(),
  dueAt: z.string().datetime(),
  actionLogId: z.string().uuid(),
}).strict();

export async function POST(request: Request) {
  if (!getSupabasePublicConfig().configured) return NextResponse.json({ error: 'Supabase não configurado.' }, { status: 503 });
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: 'Sessão expirada. Entre novamente.' }, { status: 401 });

  let payload: unknown;
  try { payload = await request.json(); }
  catch { return NextResponse.json({ error: 'Corpo JSON inválido.' }, { status: 400 }); }
  const parsed = CreateSchema.safeParse(payload);
  if (!parsed.success) return NextResponse.json({ error: 'Agendamento inválido.' }, { status: 400 });
  const dueAtIssue = scheduleDueAtIssue(parsed.data.dueAt);
  if (dueAtIssue) return NextResponse.json({ error: dueAtIssue }, { status: 400 });

  const code = createScheduleHandoffCode();
  const expiresAt = new Date(Date.now() + SCHEDULE_HANDOFF_TTL_MS).toISOString();

  try {
    const client = await createClient();
    const { data, error } = await client.from('schedule_handoffs').insert({
      user_id: user.id,
      code_hash: hashScheduleHandoffCode(code),
      body: parsed.data.body,
      recipient_name: parsed.data.recipientName ?? null,
      phone: parsed.data.phone ?? null,
      due_at: parsed.data.dueAt,
      expires_at: expiresAt,
      status: 'awaiting_device',
      action_log_id: parsed.data.actionLogId,
    }).select('id').single();
    if (error) throw error;
    return NextResponse.json(
      { id: data.id, ...buildScheduleDeepLinks(code), status: 'awaiting_device', expiresAt },
      { headers: { 'cache-control': 'no-store' } },
    );
  } catch (error) {
    console.error('[minha-agenda:data]', JSON.stringify({ timestamp: new Date().toISOString(), operation: 'schedule_create', result: 'error', error: error instanceof Error ? error.message : 'unknown' }));
    return NextResponse.json({ error: 'Não foi possível gerar o agendamento.' }, { status: 500 });
  }
}
