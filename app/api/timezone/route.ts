import { NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/supabase/auth';
import { createClient } from '@/lib/supabase/server';
import { isValidTimeZone } from '@/lib/data/time';
import { withTimezone } from '@/lib/data/server-timezone';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as { timezone?: unknown } | null;
  const timezone = typeof body?.timezone === 'string' ? body.timezone.trim() : '';
  if (!isValidTimeZone(timezone)) return NextResponse.json({ error: 'invalid_timezone' }, { status: 400 });
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const client = await createClient();
  const { data: profile } = await client.from('profiles').select('metadata').eq('user_id', user.id).maybeSingle();
  const metadata = profile?.metadata && typeof profile.metadata === 'object' && !Array.isArray(profile.metadata)
    ? profile.metadata as Record<string, unknown>
    : {};
  const { error } = await client.from('profiles').upsert({ user_id: user.id, metadata: { ...metadata, timezone } }, { onConflict: 'user_id' });
  if (error) return NextResponse.json({ error: 'persist_failed' }, { status: 500 });
  return withTimezone(timezone, () => NextResponse.json({ ok: true, timezone }));
}
