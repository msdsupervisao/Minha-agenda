export type RecognitionEvent = { results: ArrayLike<ArrayLike<{ transcript: string }>> };

// Snappier listening: stop after a shorter silence and keep a bounded ceiling/watchdog.
const SILENCE_MS = 1500;
const WATCHDOG_MS = 800;
const MAX_LISTEN_MS = 15000;

// Drops adjacent duplicate words (case-insensitive) that mobile engines echo, e.g.
// "me me me diga" -> "me diga". Deliberate emphasis is rare in short voice commands.
function dedupeAdjacentWords(text: string): string {
  const out: string[] = [];
  for (const word of text.split(/\s+/)) {
    if (!word) continue;
    if (out.length && out[out.length - 1].toLocaleLowerCase('pt-BR') === word.toLocaleLowerCase('pt-BR')) continue;
    out.push(word);
  }
  return out.join(' ');
}

// Android may return progressively longer copies of the same phrase as segments.
export function mergeVoiceSegments(segments: readonly string[]): string {
  const merged = segments.reduce((text, segment) => {
    const next = segment.trim();
    if (!text) return next;
    const left = text.trim().split(/\s+/);
    const right = next.split(/\s+/);
    for (let overlap = Math.min(left.length, right.length); overlap >= 2; overlap--) {
      if (left.slice(-overlap).join(' ').toLocaleLowerCase('pt-BR') === right.slice(0, overlap).join(' ').toLocaleLowerCase('pt-BR')) {
        return [...left, ...right.slice(overlap)].join(' ');
      }
    }
    return `${text} ${next}`.trim();
  }, '');
  return dedupeAdjacentWords(merged);
}
export type Recognition = {
  lang: string; interimResults: boolean; continuous: boolean;
  start(): void; stop(): void; abort(): void;
  onresult: ((event: RecognitionEvent) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
};

// A session owns all callbacks and timers so late browser events cannot submit twice.
export function startVoiceSession(recognition: Recognition, callbacks: {
  transcript(text: string): void; stopping(): void; complete(text: string): void; error(): void;
}) {
  let text = '';
  let previous = '';
  let stopping = false;
  let done = false;
  let silence: ReturnType<typeof setTimeout>;
  let deadline: ReturnType<typeof setTimeout>;
  let watchdog: ReturnType<typeof setTimeout> | undefined;
  function cleanup() {
    clearTimeout(silence); clearTimeout(deadline); clearTimeout(watchdog);
    recognition.onresult = recognition.onerror = recognition.onend = null;
  }
  function complete() {
    if (done) return;
    done = true;
    cleanup();
    try { recognition.abort(); } catch { /* Already ended. */ }
    callbacks.complete(text.trim());
  }
  function fail() {
    if (done) return;
    done = true;
    cleanup();
    try { recognition.abort(); } catch { /* Already ended. */ }
    callbacks.error();
  }
  function stop() {
    if (done || stopping) return;
    stopping = true;
    clearTimeout(silence); clearTimeout(deadline);
    callbacks.stopping();
    watchdog = setTimeout(complete, WATCHDOG_MS);
    try { recognition.stop(); } catch { complete(); }
  }
  function resetSilence() { clearTimeout(silence); silence = setTimeout(stop, SILENCE_MS); }
  recognition.lang = 'pt-BR';
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.onresult = (event) => {
    if (done) return;
    text = mergeVoiceSegments([previous, ...Array.from(event.results, (result) => result[0].transcript)]);
    callbacks.transcript(text);
    if (!stopping) resetSilence();
  };
  recognition.onend = () => {
    if (done) return;
    if (stopping) { complete(); return; }
    // Some mobile engines end early despite continuous=true. Preserve this segment.
    previous = text;
    try { recognition.start(); } catch { stop(); }
  };
  recognition.onerror = () => { if (stopping) complete(); else fail(); };
  resetSilence();
  deadline = setTimeout(stop, MAX_LISTEN_MS);
  try { recognition.start(); } catch { fail(); }
  return {
    stop,
    cancel() {
      done = true;
      cleanup();
      try { recognition.abort(); } catch { /* Already ended. */ }
    },
  };
}
