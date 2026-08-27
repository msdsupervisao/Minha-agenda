import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getAuthenticatedUser } from '@/lib/supabase/auth';
import { getSupabasePublicConfig } from '@/lib/supabase/config';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const QuerySchema = z.string().uuid();

export async function GET(request: Request) {
  if (!getSupabasePublicConfig().configured) return NextResponse.json({ error: 'Supabase não configurado.' }, { status: 503 });
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: 'Sessão expirada. Entre novamente.' }, { status: 401 });
  const id = QuerySchema.safeParse(new URL(request.url).searchParams.get('id'));
  if (!id.success) return NextResponse.json({ error: 'Agendamento inválido.' }, { status: 400 });

  try {
    const client = await createClient();
    const { data, error } = await client.from('schedule_handoffs')
      .select('id,status,due_at,acknowledged_at,last_error')
      .eq('id', id.data)
      .eq('user_id', user.id)
      .maybeSingle();
    if (error) throw error;
    if (!data) return NextResponse.json({ error: 'Agendamento não encontrado.' }, { status: 404 });
    return NextResponse.json({
      id: data.id,
      status: data.status,
      dueAt: data.due_at,
      acknowledgedAt: data.acknowledged_at,
      errorCode: data.last_error,
    }, { headers: { 'cache-control': 'no-store' } });
  } catch (error) {
    console.error('[minha-agenda:data]', JSON.stringify({ timestamp: new Date().toISOString(), operation: 'schedule_status', result: 'error', error: error instanceof Error ? error.message : 'unknown' }));
    return NextResponse.json({ error: 'Não foi possível consultar o agendamento.' }, { status: 500 });
  }
}
