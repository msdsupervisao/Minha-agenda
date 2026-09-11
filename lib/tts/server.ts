import { createHash } from 'node:crypto';
import { stripMarkdownForSpeech } from '../assistant/speech';

// ElevenLabs multilingual v2 gives a natural pt-BR male voice. The key only needs the
// Text-to-Speech endpoint; the voice is selected via ELEVENLABS_VOICE_ID (from the dashboard).
const MODEL_ID = 'eleven_multilingual_v2';
const OUTPUT_FORMAT = 'mp3_44100_128';
const PROVIDER = 'elevenlabs';

export function createTtsService(request: typeof fetch = fetch) {
  const cache = new Map<string, { audio: Uint8Array; expires: number }>();
  const pending = new Map<string, Promise<Uint8Array>>();
  return async (userId: string, raw: string, env: NodeJS.ProcessEnv = process.env) => {
    const text = stripMarkdownForSpeech(raw).slice(0, 800).trim();
    if (!text) throw new Error('tts_empty');
    const apiKey = env.ELEVENLABS_API_KEY;
    const voice = env.ELEVENLABS_VOICE_ID;
    if (!apiKey || !voice) throw new Error('tts_unconfigured');
    // Cache/dedup key is scoped by user + text + provider + voice so switching the voice
    // (or provider) never serves a stale clip generated with different settings.
    const key = createHash('sha256').update(JSON.stringify([userId, text, PROVIDER, voice])).digest('hex');
    const hit = cache.get(key);
    if (hit && hit.expires > Date.now()) return { audio: hit.audio, cached: true };
    cache.delete(key);
    const inflight = pending.get(key);
    if (inflight) return { audio: await inflight, cached: true };
    if (pending.size >= 4) throw new Error('tts_busy');
    const job = (async () => {
      const response = await request(
        `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voice)}?output_format=${OUTPUT_FORMAT}`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'xi-api-key': apiKey },
          body: JSON.stringify({
            text,
            model_id: MODEL_ID,
            voice_settings: { stability: 0.5, similarity_boost: 0.8 },
          }),
          signal: AbortSignal.timeout(25000),
          cache: 'no-store',
        },
      );
      if (!response.ok || !response.headers.get('content-type')?.startsWith('audio/')) throw new Error('tts_unavailable');
      const audio = new Uint8Array(await response.arrayBuffer());
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

export const synthesizeSpeech = createTtsService();
