import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createServiceClient, serviceConfigured } from '@/lib/supabase/service';
import {
  hashScheduleHandoffCode,
  isScheduleHandoffOriginAllowed,
  scheduleHandoffCorsHeaders,
  SCHEDULE_HANDOFF_CODE_PATTERN,
} from '@/lib/schedule/handoff';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const AckSchema = z.object({ code: z.string().trim().regex(SCHEDULE_HANDOFF_CODE_PATTERN) }).strict();

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
  if (!parsed.success) return json(request, { error: 'Código inválido.' }, 400);

  try {
    const client = createServiceClient();
    const { error } = await client.from('schedule_handoffs')
      .delete().eq('code_hash', hashScheduleHandoffCode(parsed.data.code));
    if (error) throw error;
    // Idempotente: repetir o ACK de um registro já removido continua sendo sucesso.
    return json(request, { ok: true });
  } catch (error) {
    console.error('[minha-agenda:data]', JSON.stringify({ timestamp: new Date().toISOString(), operation: 'schedule_ack', result: 'error', error: error instanceof Error ? error.message : 'unknown' }));
    return json(request, { error: 'Não foi possível confirmar o agendamento.' }, 500);
  }
}
