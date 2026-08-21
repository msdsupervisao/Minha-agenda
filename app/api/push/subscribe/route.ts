import { NextResponse } from 'next/server';
import { getScreenContext } from '@/lib/data/screen-queries';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const ctx = await getScreenContext();
  if (!ctx) return NextResponse.json({ error: 'Sessão expirada.' }, { status: 401 });

  const body = await request.json().catch(() => null);
  const sub = body?.subscription;
  if (!sub?.endpoint || !sub?.keys?.p256dh || !sub?.keys?.auth) {
    return NextResponse.json({ error: 'Inscrição inválida.' }, { status: 400 });
  }

  const { error } = await ctx.client.from('push_subscriptions').upsert({
    user_id: ctx.userId,
    endpoint: sub.endpoint,
    p256dh: sub.keys.p256dh,
    auth: sub.keys.auth,
    user_agent: request.headers.get('user-agent') || null,
  }, { onConflict: 'user_id,endpoint' });
  if (error) return NextResponse.json({ error: 'Não foi possível salvar a inscrição.' }, { status: 500 });

  return NextResponse.json({ ok: true });
}
