import { NextResponse } from 'next/server';
import { getScreenContext } from '@/lib/data/screen-queries';
import { pushConfigured, sendPush } from '@/lib/push/send';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST() {
  const ctx = await getScreenContext();
  if (!ctx) return NextResponse.json({ error: 'Sessão expirada.' }, { status: 401 });
  if (!pushConfigured()) return NextResponse.json({ error: 'Push não configurado.' }, { status: 503 });

  const { data } = await ctx.client.from('push_subscriptions').select('*').eq('user_id', ctx.userId);
  let sent = 0;
  for (const s of data || []) {
    const result = await sendPush(
      { endpoint: String(s.endpoint), p256dh: String(s.p256dh), auth: String(s.auth) },
      { title: 'Minha Agenda', body: 'Notificação de teste ✔', url: '/agenda', tag: 'teste' },
    );
    if (result.ok) sent += 1;
    else if (result.gone) await ctx.client.from('push_subscriptions').delete().eq('id', s.id as string);
  }
  return NextResponse.json({ ok: true, sent });
}
