import assert from 'node:assert/strict';
import test from 'node:test';
import { createTtsService } from '../lib/tts/server';

function jsonResponse(body: unknown, init: { ok?: boolean } = {}) {
  return {
    ok: init.ok ?? true,
    headers: { get: () => 'application/json' },
    json: async () => body,
    async arrayBuffer() { return new ArrayBuffer(0); },
  } as unknown as Response;
}

test('Google TTS: sintetiza voz pt-BR a partir do base64 e chama o endpoint do Google', async () => {
  const calls: { url: string; init: RequestInit }[] = [];
  const audio = Buffer.from('fake-mp3-bytes');
  const mockFetch = (async (url: unknown, init: unknown) => {
    calls.push({ url: String(url), init: init as RequestInit });
    return jsonResponse({ audioContent: audio.toString('base64') });
  }) as unknown as typeof fetch;

  const synth = createTtsService(mockFetch);
  const result = await synth('user-1', 'Olá Fernando', {
    TTS_PROVIDER: 'google',
    GOOGLE_TTS_API_KEY: 'chave-teste',
    GOOGLE_TTS_VOICE: 'pt-BR-Neural2-B',
  } as unknown as NodeJS.ProcessEnv);

  assert.equal(result.cached, false);
  assert.deepEqual(Buffer.from(result.audio), audio);
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /texttospeech\.googleapis\.com/);
  const headers = calls[0].init.headers as Record<string, string>;
  assert.equal(headers['X-goog-api-key'], 'chave-teste');
  const body = JSON.parse(String(calls[0].init.body));
  assert.equal(body.voice.name, 'pt-BR-Neural2-B');
  assert.equal(body.voice.languageCode, 'pt-BR');
  assert.equal(body.audioConfig.audioEncoding, 'MP3');
});

test('Google TTS: falha como tts_unconfigured quando falta a chave', async () => {
  const synth = createTtsService((async () => jsonResponse({})) as unknown as typeof fetch);
  await assert.rejects(
    synth('user-1', 'oi', { TTS_PROVIDER: 'google', GOOGLE_TTS_VOICE: 'pt-BR-Neural2-B' } as unknown as NodeJS.ProcessEnv),
    /tts_unconfigured/,
  );
});

function audioFetch(calls: string[]) {
  return (async (url: unknown) => {
    calls.push(String(url));
    return {
      ok: true,
      headers: { get: (h: string) => (h === 'content-type' ? 'audio/mpeg' : null) },
      async arrayBuffer() { return Buffer.from('audio-bytes'); },
    } as unknown as Response;
  }) as unknown as typeof fetch;
}

test('gtranslate é o provider padrão (grátis, sem chave) quando TTS_PROVIDER não é definido', async () => {
  const calls: string[] = [];
  const synth = createTtsService(audioFetch(calls));
  // Mesmo com chaves do ElevenLabs presentes, o padrão é a voz gratuita do Google Translate.
  const result = await synth('user-1', 'oi', {
    ELEVENLABS_API_KEY: 'k',
    ELEVENLABS_VOICE_ID: 'JBFqnCBsd6RMkjVDRZzb',
  } as unknown as NodeJS.ProcessEnv);

  assert.equal(result.cached, false);
  assert.match(calls[0], /translate\.google\.com\/translate_tts/);
  assert.match(calls[0], /tl=pt-BR/);
});

test('gtranslate: quebra texto longo em pedaços de até 200 chars e junta os MP3s', async () => {
  const calls: string[] = [];
  const synth = createTtsService(audioFetch(calls));
  const longText = 'palavra '.repeat(60).trim(); // ~479 chars -> múltiplos pedaços
  await synth('user-1', longText, {} as unknown as NodeJS.ProcessEnv);
  assert.ok(calls.length >= 2, `esperava múltiplas chamadas, teve ${calls.length}`);
  assert.ok(calls.every((url) => url.includes('translate_tts')));
});

test('ElevenLabs é usado quando TTS_PROVIDER=elevenlabs', async () => {
  const calls: string[] = [];
  const synth = createTtsService(audioFetch(calls));
  const result = await synth('user-1', 'oi', {
    TTS_PROVIDER: 'elevenlabs',
    ELEVENLABS_API_KEY: 'k',
    ELEVENLABS_VOICE_ID: 'JBFqnCBsd6RMkjVDRZzb',
  } as unknown as NodeJS.ProcessEnv);

  assert.equal(result.cached, false);
  assert.match(calls[0], /api\.elevenlabs\.io/);
});
