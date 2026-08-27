import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createServiceClient, serviceConfigured } from '@/lib/supabase/service';
import {
  hashScheduleHandoffCode,
  isScheduleHandoffOriginAllowed,
  scheduleAuditExpiresAt,
  scheduleHandoffCorsHeaders,
  SCHEDULE_HANDOFF_CODE_PATTERN,
} from '@/lib/schedule/handoff';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const AckSchema = z.discriminatedUnion('status', [
  z.object({
    code: z.string().trim().regex(SCHEDULE_HANDOFF_CODE_PATTERN),
    status: z.literal('scheduled_on_device'),
    notificationId: z.number().int().positive().max(2_147_483_000),
  }).strict(),
  z.object({
    code: z.string().trim().regex(SCHEDULE_HANDOFF_CODE_PATTERN),
    status: z.literal('failed'),
    errorCode: z.enum(['permission_denied', 'invalid_time', 'schedule_failed']),
  }).strict(),
]);

function json(request: Request, body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: scheduleHandoffCorsHeaders(request.headers.get('origin')),
  });
}

export function OPTIONS(request: Request) {
  const origin = request.headers.get('origin');
  return new NextResponse(null, {
    status: isScheduleHandoffOriginAllowed(origin) ? 204 : 403,
    headers: scheduleHandoffCorsHeaders(origin),
  });
}

export async function POST(request: Request) {
  const origin = request.headers.get('origin');
  if (!isScheduleHandoffOriginAllowed(origin)) return json(request, { error: 'origin_not_allowed' }, 403);
  if (!serviceConfigured()) return json(request, { error: 'not_configured' }, 503);

  let payload: unknown;
  try { payload = await request.json(); }
  catch { return json(request, { error: 'Corpo JSON inválido.' }, 400); }
  const parsed = AckSchema.safeParse(payload);
  if (!parsed.success) return json(request, { error: 'Confirmação inválida.' }, 400);

  try {
    const client = createServiceClient();
    const codeHash = hashScheduleHandoffCode(parsed.data.code);
    const { data: row, error: loadError } = await client.from('schedule_handoffs')
      .select('id,user_id,due_at,action_log_id')
      .eq('code_hash', codeHash)
      .maybeSingle();
    if (loadError) throw loadError;
    if (!row) return json(request, { ok: true, stored: false });

    const now = new Date().toISOString();
    const scheduled = parsed.data.status === 'scheduled_on_device';
    const deviceState = parsed.data.status === 'scheduled_on_device'
      ? { device_notification_id: parsed.data.notificationId, acknowledged_at: now, last_error: null }
      : { device_notification_id: null, acknowledged_at: now, last_error: parsed.data.errorCode };
    let update = client.from('schedule_handoffs').update({
      status: parsed.data.status,
      ...deviceState,
      expires_at: scheduleAuditExpiresAt(String(row.due_at)),
    }).eq('id', row.id);
    // Sucesso é evidência mais forte e não pode ser rebaixado por uma falha tardia
    // de outra abertura/requisição. Uma nova confirmação pode recuperar `failed`.
    if (!scheduled) update = update.neq('status', 'scheduled_on_device');
    const { data: updated, error: updateError } = await update.select('id').maybeSingle();
    if (updateError) throw updateError;

    if (!updated) {
      return json(request, { ok: true, stored: false, status: 'scheduled_on_device' });
    }

    if (row.action_log_id) {
      const { error: logError } = await client.from('action_logs').update({
        status: scheduled ? 'completed' : 'failed',
        updated_at: now,
      }).eq('id', row.action_log_id).eq('user_id', row.user_id);
      if (logError) throw logError;
    }
    return json(request, { ok: true, stored: true, status: parsed.data.status });
  } catch (error) {
    console.error('[minha-agenda:data]', JSON.stringify({ timestamp: new Date().toISOString(), operation: 'schedule_ack', result: 'error', error: error instanceof Error ? error.message : 'unknown' }));
    return json(request, { error: 'Não foi possível registrar o resultado do agendamento.' }, 500);
  }
}
