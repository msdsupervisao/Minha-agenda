import { getAuthenticatedUser } from '@/lib/supabase/auth';
import { synthesizeSpeech } from '@/lib/tts/server';

// TEMPORARY diagnostic: reports which TTS provider is selected, which env vars are present
// (booleans only — never their values), the real synthesis error the public route masks,
// and a RAW probe of the upstream provider so we can read its exact status/reason (e.g.
// 401 invalid key vs 402/429 quota exhausted). Authenticated — owner only. Remove after fix.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function probeElevenLabs(key: string, voice: string) {
  try {
    const response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voice)}?output_format=mp3_44100_128`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'xi-api-key': key },
        body: JSON.stringify({ text: 'teste', model_id: 'eleven_multilingual_v2', voice_settings: { stability: 0.5, similarity_boost: 0.8 } }),
        signal: AbortSignal.timeout(15000),
        cache: 'no-store',
      },
    );
    const contentType = response.headers.get('content-type') || '';
    const body = contentType.startsWith('audio/') ? '' : (await response.text()).slice(0, 500);
    return { status: response.status, ok: response.ok, contentType, body };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

async function probeGoogle(key: string, voice: string) {
  try {
    const languageCode = /^[a-z]{2}-[A-Z]{2}/.exec(voice)?.[0] ?? 'pt-BR';
    const response = await fetch('https://texttospeech.googleapis.com/v1/text:synthesize', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'X-goog-api-key': key },
      body: JSON.stringify({ input: { text: 'teste' }, voice: { languageCode, name: voice }, audioConfig: { audioEncoding: 'MP3' } }),
      signal: AbortSignal.timeout(15000),
      cache: 'no-store',
    });
    const body = response.ok ? '' : (await response.text()).slice(0, 500);
    return { status: response.status, ok: response.ok, body };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

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
  let upstream: unknown = '(sem probe)';
  if (provider === 'google' && env.GOOGLE_TTS_API_KEY) {
    upstream = await probeGoogle(env.GOOGLE_TTS_API_KEY, env.GOOGLE_TTS_VOICE?.trim() || 'pt-BR-Neural2-B');
  } else if (env.ELEVENLABS_API_KEY && env.ELEVENLABS_VOICE_ID) {
    upstream = await probeElevenLabs(env.ELEVENLABS_API_KEY, env.ELEVENLABS_VOICE_ID);
  }
  return Response.json({ provider, presence, attempt, upstream });
}
