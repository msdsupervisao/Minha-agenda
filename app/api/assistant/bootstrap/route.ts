import { NextResponse } from 'next/server';
import { loadPersistentActivities } from '@/lib/assistant/server-conversation';
import { getSupabasePublicConfig } from '@/lib/supabase/config';
import { getAuthenticatedUser } from '@/lib/supabase/auth';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  if (!getSupabasePublicConfig().configured) return NextResponse.json({ error: 'Supabase não configurado.' }, { status: 503 });
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: 'Sessão expirada.' }, { status: 401 });
  try {
    const activities = await loadPersistentActivities(await createClient(), user.id);
    return NextResponse.json({ activities }, { headers: { 'cache-control': 'no-store' } });
  } catch {
    return NextResponse.json({ error: 'Não foi possível carregar sua memória.' }, { status: 500 });
  }
}
