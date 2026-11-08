import { NextResponse } from 'next/server';
import { z } from 'zod';
import { BridgeInputSchema, BridgeQueue } from '@/lib/agent/bridge-queue';
import { bridgeOnline } from '@/lib/agent/bridge-presence';
import { getAuthenticatedUser } from '@/lib/supabase/auth';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const headers = { 'cache-control': 'no-store' };

export async function POST(request: Request) {
  if (process.env.AGENT_BRIDGE_ENABLED !== 'true') return NextResponse.json({ error: 'Ponte não ativada.' }, { status: 404, headers });
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: 'Sessão expirada.' }, { status: 401, headers });
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) return NextResponse.json({ error: 'Formato inválido.' }, { status: 415, headers });
  const payload = await request.json().catch(() => null);
  const parsed = z.union([
    z.object({ requestId: z.string().uuid(), input: BridgeInputSchema }).strict(),
    z.object({ approvalId: z.string().uuid(), decision: z.enum(['approve', 'cancel']) }).strict(),
  ]).safeParse(payload);
  if (!parsed.success) return NextResponse.json({ error: 'Pedido inválido.' }, { status: 400, headers });
  try {
    const queue = new BridgeQueue(await createClient());
    if ('approvalId' in parsed.data) {
      await queue.decide(parsed.data.approvalId, parsed.data.decision);
      return NextResponse.json({ id: parsed.data.approvalId }, { status: 202, headers });
    }
    const id = await queue.enqueue(parsed.data.requestId, parsed.data.input);
    return NextResponse.json({ id }, { status: 202, headers });
  } catch (error) {
    if ('approvalId' in parsed.data && error instanceof Error && error.message === 'bridge_decision_not_pending') return NextResponse.json({ error: 'A confirmação expirou ou já foi utilizada. Reabra a agenda para consultar o pedido.' }, { status: 409, headers });
    if ('approvalId' in parsed.data) return NextResponse.json({ error: 'Não foi possível confirmar agora. Reabra a agenda para consultar o pedido.' }, { status: 503, headers });
    return NextResponse.json({ error: 'Não foi possível registrar o pedido da ponte.' }, { status: 503, headers });
  }
}

export async function GET(request: Request) {
  if (process.env.AGENT_BRIDGE_ENABLED !== 'true') return NextResponse.json({ error: 'Ponte não ativada.' }, { status: 404, headers });
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: 'Sessão expirada.' }, { status: 401, headers });
  const params = new URL(request.url).searchParams;
  if (params.get('status') === '1') {
    const client = await createClient();
    const { data, error } = await client.from('agent_bridge_presence').select('last_seen_at').eq('user_id', user.id).maybeSingle();
    if (error) return NextResponse.json({ error: 'Não foi possível verificar a ponte.' }, { status: 503, headers });
    return NextResponse.json({ online: bridgeOnline(data?.last_seen_at) }, { headers });
  }
  const byRequest = !params.has('id');
  const parsed = z.string().uuid().safeParse(params.get(byRequest ? 'requestId' : 'id'));
  if (!parsed.success) return NextResponse.json({ error: 'Pedido inválido.' }, { status: 400, headers });
  const client = await createClient();
  const { data, error } = await client.from('agent_bridge_jobs').select('id,status,result,created_at,started_at,finished_at').eq(byRequest ? 'request_id' : 'id', parsed.data).eq('user_id', user.id).maybeSingle();
  if (error) return NextResponse.json({ error: 'Não foi possível consultar o pedido.' }, { status: 503, headers });
  if (!data) return NextResponse.json({ error: 'Pedido não encontrado.' }, { status: 404, headers });
  if (data.status === 'approval_required' && data.result && typeof data.result === 'object') {
    const result = data.result as Record<string, unknown>;
    return NextResponse.json({ ...data, result: { kind: 'approval_required', reply: result.reply, approvalId: data.id } }, { headers });
  }
  return NextResponse.json(data, { headers });
}
