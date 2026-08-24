import { NextResponse } from 'next/server';
import { z } from 'zod';
import { runPersistentConversation } from '@/lib/assistant/server-conversation';
import { getSupabasePublicConfig } from '@/lib/supabase/config';
import { getAuthenticatedUser } from '@/lib/supabase/auth';
import { createClient } from '@/lib/supabase/server';
import { resolveTimezone } from '@/lib/data/server-timezone';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CommandSchema = z.object({
  text: z.string().trim().min(1).max(2000),
  source: z.enum(['voice', 'text']),
}).strict();

export async function POST(request: Request) {
  if (!getSupabasePublicConfig().configured) return NextResponse.json({ error: 'Supabase não configurado.' }, { status: 503 });
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: 'Sessão expirada. Entre novamente.' }, { status: 401 });
  let body: unknown;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: 'Corpo JSON inválido.' }, { status: 400 }); }
  const parsed = CommandSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'Comando inválido.' }, { status: 400 });

  try {
    const client = await createClient();
    const timezone = await resolveTimezone();
    const result = await runPersistentConversation(client, user.id, parsed.data.text, parsed.data.source, timezone);
    return NextResponse.json(result, { headers: { 'cache-control': 'no-store' } });
  } catch (error) {
    console.error('[minha-agenda:data]', JSON.stringify({ timestamp: new Date().toISOString(), operation: 'command', result: 'error', error: error instanceof Error ? error.message : 'unknown' }));
    return NextResponse.json({ error: 'Não foi possível concluir o acesso à sua memória persistente.' }, { status: 500 });
  }
}
