import { createHash } from 'node:crypto';
import { stripMarkdownForSpeech } from '../assistant/speech';

// Three TTS providers, chosen by TTS_PROVIDER ('gtranslate' default | 'google' | 'elevenlabs'):
// - gtranslate: Google Translate's public TTS. No key, no billing, free. Decent pt-BR voice,
//   but ~200 chars per request, so we chunk and concatenate the MP3 parts.
// - google: Google Cloud Text-to-Speech, native neural pt-BR voices (needs billing + key).
// - elevenlabs: ElevenLabs multilingual v2 (needs a paid-tier key + voice id).
const ELEVEN_MODEL_ID = 'eleven_multilingual_v2';
const ELEVEN_OUTPUT_FORMAT = 'mp3_44100_128';
const GOOGLE_DEFAULT_VOICE = 'pt-BR-Neural2-B';
const GOOGLE_DEFAULT_LANGUAGE = 'pt-BR';
const GTRANSLATE_LANG = 'pt-BR';
const GTRANSLATE_MAX_CHARS = 200;
const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

export function createTtsService(request: typeof fetch = fetch) {
  const cache = new Map<string, { audio: Uint8Array; expires: number }>();
  const pending = new Map<string, Promise<Uint8Array>>();
  return async (userId: string, raw: string, env: NodeJS.ProcessEnv = process.env) => {
    const text = stripMarkdownForSpeech(raw).slice(0, 800).trim();
    if (!text) throw new Error('tts_empty');
    const provider = (env.TTS_PROVIDER || 'gtranslate').trim().toLowerCase();
    // Resolve a per-provider "voice" label used only to scope the cache; providers that need a
    // key validate it here so a missing config surfaces as tts_unconfigured.
    let voice: string;
    if (provider === 'google') {
      if (!env.GOOGLE_TTS_API_KEY) throw new Error('tts_unconfigured');
      voice = env.GOOGLE_TTS_VOICE?.trim() || GOOGLE_DEFAULT_VOICE;
    } else if (provider === 'elevenlabs') {
      if (!env.ELEVENLABS_API_KEY || !env.ELEVENLABS_VOICE_ID) throw new Error('tts_unconfigured');
      voice = env.ELEVENLABS_VOICE_ID;
    } else {
      voice = GTRANSLATE_LANG;
    }
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
      const audio = provider === 'google'
        ? await synthesizeGoogle(request, env.GOOGLE_TTS_API_KEY!, voice, text)
        : provider === 'elevenlabs'
          ? await synthesizeElevenLabs(request, env.ELEVENLABS_API_KEY!, voice, text)
          : await synthesizeGoogleTranslate(request, text);
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

// Splits on whitespace into pieces no longer than GTRANSLATE_MAX_CHARS (the translate_tts
// per-request limit). A single over-long word is hard-split so it never exceeds the cap.
function chunkForTranslate(text: string): string[] {
  const chunks: string[] = [];
  let current = '';
  for (const word of text.split(/\s+/)) {
    if (!word) continue;
    if (word.length > GTRANSLATE_MAX_CHARS) {
      if (current) { chunks.push(current); current = ''; }
      for (let i = 0; i < word.length; i += GTRANSLATE_MAX_CHARS) chunks.push(word.slice(i, i + GTRANSLATE_MAX_CHARS));
      continue;
    }
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length > GTRANSLATE_MAX_CHARS) { chunks.push(current); current = word; }
    else current = candidate;
  }
  if (current) chunks.push(current);
  return chunks;
}

// Google Translate's public TTS: free, no key. Limited to ~200 chars/request, so we fetch each
// chunk and concatenate the MP3 byte streams (sequential MP3 frames play back as one clip).
async function synthesizeGoogleTranslate(request: typeof fetch, text: string): Promise<Uint8Array> {
  const parts = chunkForTranslate(text);
  const total = parts.length;
  const buffers: Uint8Array[] = [];
  for (let idx = 0; idx < total; idx += 1) {
    const q = parts[idx];
    const url = `https://translate.google.com/translate_tts?ie=UTF-8&tl=${GTRANSLATE_LANG}&client=tw-ob&total=${total}&idx=${idx}&textlen=${q.length}&q=${encodeURIComponent(q)}`;
    const response = await request(url, {
      headers: { 'user-agent': BROWSER_UA },
      signal: AbortSignal.timeout(15000),
      cache: 'no-store',
    });
    if (!response.ok || !response.headers.get('content-type')?.startsWith('audio/')) throw new Error('tts_unavailable');
    buffers.push(new Uint8Array(await response.arrayBuffer()));
  }
  const length = buffers.reduce((sum, buffer) => sum + buffer.length, 0);
  const audio = new Uint8Array(length);
  let offset = 0;
  for (const buffer of buffers) { audio.set(buffer, offset); offset += buffer.length; }
  return audio;
}

export const synthesizeSpeech = createTtsService();
