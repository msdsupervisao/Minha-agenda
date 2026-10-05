import { getAuthenticatedUser } from '@/lib/supabase/auth';
import { synthesizeSpeech } from '@/lib/tts/server';

// TEMPORARY diagnostic: reports which TTS provider is selected, which env vars are present
// (booleans only — never their values) and the REAL synthesis error the public route masks
// behind a generic 503. Authenticated so only the owner can read it. Remove after fixing.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const user = await getAuthenticatedUser();
  if (!user) return Response.json({ error: 'unauthorized' }, { status: 401 });
  const env = process.env;
  const provider = (env.TTS_PROVIDER || 'elevenlabs').trim().toLowerCase();
  const presence = {
    TTS_PROVIDER: env.TTS_PROVIDER || '(não definido → usa elevenlabs)',
    hasElevenKey: Boolean(env.ELEVENLABS_API_KEY),
    hasElevenVoice: Boolean(env.ELEVENLABS_VOICE_ID),
    hasGoogleKey: Boolean(env.GOOGLE_TTS_API_KEY),
    googleVoice: env.GOOGLE_TTS_VOICE || '(padrão pt-BR-Neural2-B)',
  };
  let attempt: unknown;
  try {
    const result = await synthesizeSpeech(user.id, 'Teste de diagnóstico de voz.');
    attempt = { ok: true, bytes: result.audio.length, cached: result.cached };
  } catch (error) {
    attempt = { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
  return Response.json({ provider, presence, attempt });
}
