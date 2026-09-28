import { createHash } from 'node:crypto';
import { stripMarkdownForSpeech } from '../assistant/speech';

// Two TTS providers, chosen by TTS_PROVIDER ('elevenlabs' default | 'google'):
// - ElevenLabs multilingual v2, voice via ELEVENLABS_VOICE_ID.
// - Google Cloud Text-to-Speech, native pt-BR voices via GOOGLE_TTS_VOICE, reusing the
//   Google Cloud billing already set up for the model provider (free tier ~1M chars/month).
const ELEVEN_MODEL_ID = 'eleven_multilingual_v2';
const ELEVEN_OUTPUT_FORMAT = 'mp3_44100_128';
const GOOGLE_DEFAULT_VOICE = 'pt-BR-Neural2-B';
const GOOGLE_DEFAULT_LANGUAGE = 'pt-BR';

export function createTtsService(request: typeof fetch = fetch) {
  const cache = new Map<string, { audio: Uint8Array; expires: number }>();
  const pending = new Map<string, Promise<Uint8Array>>();
  return async (userId: string, raw: string, env: NodeJS.ProcessEnv = process.env) => {
    const text = stripMarkdownForSpeech(raw).slice(0, 800).trim();
    if (!text) throw new Error('tts_empty');
    const provider = (env.TTS_PROVIDER || 'elevenlabs').trim().toLowerCase();
    const google = provider === 'google';
    const apiKey = google ? env.GOOGLE_TTS_API_KEY : env.ELEVENLABS_API_KEY;
    const voice = google ? (env.GOOGLE_TTS_VOICE?.trim() || GOOGLE_DEFAULT_VOICE) : env.ELEVENLABS_VOICE_ID;
    if (!apiKey || !voice) throw new Error('tts_unconfigured');
    // Cache/dedup key is scoped by user + text + provider + voice so switching the voice
    // (or provider) never serves a stale clip generated with different settings.
    const key = createHash('sha256').update(JSON.stringify([userId, text, provider, voice])).digest('hex');
    const hit = cache.get(key);
    if (hit && hit.expires > Date.now()) return { audio: hit.audio, cached: true };
    cache.delete(key);
    const inflight = pending.get(key);
    if (inflight) return { audio: await inflight, cached: true };
    if (pending.size >= 4) throw new Error('tts_busy');
    const job = (async () => {
      const audio = google
        ? await synthesizeGoogle(request, apiKey, voice, text)
        : await synthesizeElevenLabs(request, apiKey, voice, text);
      if (!audio.length || audio.length > 2_000_000) throw new Error('tts_invalid_audio');
      // At most 32 small audio clips per warm server instance, scoped by user.
      if (cache.size >= 32) cache.delete(cache.keys().next().value!);
      cache.set(key, { audio, expires: Date.now() + 15 * 60000 });
      return audio;
    })();
    pending.set(key, job);
    try { return { audio: await job, cached: false }; }
    finally { pending.delete(key); }
  };
}

async function synthesizeElevenLabs(request: typeof fetch, apiKey: string, voice: string, text: string): Promise<Uint8Array> {
  const response = await request(
    `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voice)}?output_format=${ELEVEN_OUTPUT_FORMAT}`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'xi-api-key': apiKey },
      body: JSON.stringify({
        text,
        model_id: ELEVEN_MODEL_ID,
        voice_settings: { stability: 0.5, similarity_boost: 0.8 },
      }),
      signal: AbortSignal.timeout(25000),
      cache: 'no-store',
    },
  );
  if (!response.ok || !response.headers.get('content-type')?.startsWith('audio/')) throw new Error('tts_unavailable');
  return new Uint8Array(await response.arrayBuffer());
}

// Google Cloud Text-to-Speech returns MP3 as base64 JSON. The key authenticates via the
// X-goog-api-key header (never in the URL). languageCode is derived from the voice name.
async function synthesizeGoogle(request: typeof fetch, apiKey: string, voice: string, text: string): Promise<Uint8Array> {
  const languageCode = /^[a-z]{2}-[A-Z]{2}/.exec(voice)?.[0] ?? GOOGLE_DEFAULT_LANGUAGE;
  const response = await request(
    'https://texttospeech.googleapis.com/v1/text:synthesize',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'X-goog-api-key': apiKey },
      body: JSON.stringify({
        input: { text },
        voice: { languageCode, name: voice },
        audioConfig: { audioEncoding: 'MP3' },
      }),
      signal: AbortSignal.timeout(25000),
      cache: 'no-store',
    },
  );
  if (!response.ok) throw new Error('tts_unavailable');
  const data = (await response.json().catch(() => null)) as { audioContent?: string } | null;
  if (!data?.audioContent) throw new Error('tts_unavailable');
  return new Uint8Array(Buffer.from(data.audioContent, 'base64'));
}

export const synthesizeSpeech = createTtsService();
