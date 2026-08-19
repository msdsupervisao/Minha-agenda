import { NextResponse } from 'next/server';
import { z } from 'zod';
import { AiProviderError } from '@/lib/assistant/ai-provider';
import { getAiRuntimeConfig } from '@/lib/assistant/ai-config';
import { interpretOnServer } from '@/lib/assistant/ai-runtime';
import { getSupabasePublicConfig } from '@/lib/supabase/config';
import { getAuthenticatedUser } from '@/lib/supabase/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const RequestSchema = z.object({
  text: z.string().trim().min(1).max(2000),
  source: z.enum(['voice', 'text']),
  context: z.array(z.object({ role: z.enum(['user', 'assistant']), text: z.string().max(2000) }).strict()).max(12).default([]),
}).strict();

export async function POST(request: Request) {
  if (getSupabasePublicConfig().configured && !await getAuthenticatedUser()) {
    return NextResponse.json({ error: 'Sessão expirada. Entre novamente.' }, { status: 401 });
  }
  let body: unknown;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: 'Corpo JSON inválido.' }, { status: 400 }); }
  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'Comando inválido.' }, { status: 400 });

  const config = getAiRuntimeConfig();
  try {
    const result = await interpretOnServer({
      text: parsed.data.text,
      now: new Date(),
      timezone: process.env.APP_TIMEZONE || 'America/Cuiaba',
      context: { turns: parsed.data.context, source: parsed.data.source },
    }, { config });
    return NextResponse.json(result, { headers: { 'cache-control': 'no-store' } });
  } catch (error) {
    const providerError = error instanceof AiProviderError ? error : null;
    const status = providerError?.code === 'timeout' ? 504 : 502;
    const message = providerError?.code === 'timeout'
      ? 'A OpenAI demorou demais para responder. Tente novamente.'
      : providerError?.code === 'invalid_output'
        ? 'A OpenAI retornou uma resposta inválida. Nenhuma ação foi executada.'
        : 'Não foi possível interpretar o comando pela OpenAI. Nenhuma ação foi executada.';
    return NextResponse.json({ error: message, code: providerError?.code || 'internal_error', provider: config.activeProvider }, { status });
  }
}
