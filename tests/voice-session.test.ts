import assert from 'node:assert/strict';
import test from 'node:test';
import { mergeVoiceSegments, startVoiceSession, type Recognition } from '../lib/assistant/voice-session';

test('Chrome Android: versões crescentes da frase não se acumulam', () => {
  assert.equal(mergeVoiceSegments(['a nossa', 'a nossa', 'a nossa temperatura', 'a nossa temperatura atual', 'a nossa temperatura atual']), 'a nossa temperatura atual');
  // Palavras iniciais repetidas pelo motor do celular ("me me me diga") são colapsadas.
  assert.equal(mergeVoiceSegments(['me', 'me', 'me', 'me diga quem é você']), 'me diga quem é você');
  assert.equal(mergeVoiceSegments(['porque', 'porque']), 'porque');
  assert.equal(mergeVoiceSegments(['não', 'não quero isso']), 'não quero isso');
});

function fixture(autoStart = true) {
  const events: string[] = [];
  const recognition: Recognition = {
    lang: '', interimResults: false, continuous: false,
    start() { events.push('start'); }, stop() { events.push('stop'); }, abort() { events.push('abort'); },
    onresult: null, onend: null, onerror: null,
  };
  const session = startVoiceSession(recognition, {
    transcript(text) { events.push(`text:${text}`); }, stopping() { events.push('stopping'); },
    complete(text) { events.push(`complete:${text}`); }, error() { events.push('error'); },
  });
  const say = (...text: string[]) => recognition.onresult?.({ results: text.map((transcript) => [{ transcript }]) });
  if (autoStart) recognition.onstart?.();
  return { events, recognition, session, say };
}

test('dá 3s para começar e 3s entre frases, acumula segmentos e conclui uma vez', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const f = fixture();
  t.mock.timers.tick(2999);
  assert.ok(!f.events.includes('stop'));
  f.say('me lembre');
  t.mock.timers.tick(2900);
  f.say('me lembre', 'amanhã às nove');
  t.mock.timers.tick(2999);
  assert.ok(!f.events.includes('stop'));
  t.mock.timers.tick(1);
  assert.deepEqual(f.events.slice(-2), ['stopping', 'stop']);
  f.recognition.onend?.();
  t.mock.timers.tick(20000);
  assert.equal(f.events.filter((e) => e.startsWith('complete:')).length, 1);
  assert.ok(f.events.includes('complete:me lembre amanhã às nove'));
});

test('ativação lenta não consome os três segundos iniciais', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const f = fixture(false);
  t.mock.timers.tick(6000);
  assert.ok(!f.events.includes('stop'));
  f.recognition.onstart?.();
  t.mock.timers.tick(2999);
  assert.ok(!f.events.includes('stop'));
  t.mock.timers.tick(1);
  assert.ok(f.events.includes('stop'));
});

test('fala ativa aguarda transcrição lenta e encerra após a pausa', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const f = fixture();
  f.recognition.onspeechstart?.();
  t.mock.timers.tick(7000);
  f.say('me lembre amanhã');
  t.mock.timers.tick(4000);
  assert.ok(!f.events.includes('stop'));
  f.recognition.onspeechend?.();
  t.mock.timers.tick(3000);
  assert.ok(f.events.includes('stop'));
});

test('no-speech reinicia sem erro e sem renovar o prazo inicial', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const f = fixture();
  t.mock.timers.tick(2000);
  f.recognition.onerror?.({ error: 'no-speech' });
  f.recognition.onend?.();
  f.recognition.onstart?.();
  t.mock.timers.tick(1000);
  assert.ok(!f.events.includes('error'));
  assert.ok(f.events.includes('stop'));
});

test('teto de 30s e watchdog encerram mesmo sem onend do navegador', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const f = fixture();
  for (let i = 0; i < 30; i++) { t.mock.timers.tick(1000); f.say('pedido longo'); }
  assert.ok(f.events.includes('stopping'));
  t.mock.timers.tick(800);
  assert.ok(f.events.includes('complete:pedido longo'));
  assert.equal(f.recognition.onresult, null);
});

test('fim precoce preserva fala; cancelamento e erro limpam os timers', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const f = fixture();
  f.say('me lembre'); f.recognition.onend?.(); f.say('amanhã');
  assert.ok(f.events.includes('text:me lembre amanhã'));
  f.session.cancel();
  const g = fixture(); g.recognition.onerror?.({ error: 'not-allowed' });
  t.mock.timers.tick(20000);
  assert.ok(!f.events.includes('stop'));
  assert.ok(g.events.includes('error'));
  assert.ok(!g.events.includes('stop'));
});
