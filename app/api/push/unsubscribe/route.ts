import { NextResponse } from 'next/server';
import { getScreenContext } from '@/lib/data/screen-queries';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const ctx = await getScreenContext();
  if (!ctx) return NextResponse.json({ error: 'Sessão expirada.' }, { status: 401 });

  const body = await request.json().catch(() => null);
  const endpoint = body?.endpoint;
  if (!endpoint) return NextResponse.json({ error: 'Endpoint ausente.' }, { status: 400 });

  await ctx.client.from('push_subscriptions').delete().eq('user_id', ctx.userId).eq('endpoint', endpoint);
  return NextResponse.json({ ok: true });
}
