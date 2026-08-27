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

// Sem autenticação do Supabase: o app não tem sessão. O código aleatório e de
// validade curta é a credencial. O registro só é apagado pelo ACK depois que a
// notificação estiver salva no aparelho, permitindo retry em falha de rede.
const RedeemSchema = z.object({ code: z.string().trim().regex(SCHEDULE_HANDOFF_CODE_PATTERN) }).strict();

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
  const parsed = RedeemSchema.safeParse(payload);
  if (!parsed.success) return json(request, { error: 'Código inválido.' }, 400);

  try {
    const client = createServiceClient();
    const codeHash = hashScheduleHandoffCode(parsed.data.code);
    const { data: row, error } = await client.from('schedule_handoffs')
      .select('body,recipient_name,phone,due_at,expires_at,status,device_notification_id')
      .eq('code_hash', codeHash).maybeSingle();
    if (error) throw error;
    if (!row) return json(request, { error: 'Código não encontrado.' }, 404);
    if (new Date(String(row.expires_at)).getTime() <= Date.now()) {
      await client.from('schedule_handoffs').delete().eq('code_hash', codeHash);
      return json(request, { error: 'Código expirado.' }, 410);
    }

    return json(request, {
      body: row.body,
      recipientName: row.recipient_name,
      phone: row.phone,
      dueAt: row.due_at,
      status: row.status,
      notificationId: row.device_notification_id,
    });
  } catch (error) {
    console.error('[minha-agenda:data]', JSON.stringify({ timestamp: new Date().toISOString(), operation: 'schedule_redeem', result: 'error', error: error instanceof Error ? error.message : 'unknown' }));
    return json(request, { error: 'Não foi possível resgatar o agendamento.' }, 500);
  }
}
