export type RecognitionEvent = { results: ArrayLike<ArrayLike<{ transcript: string }>> };

// Android may return progressively longer copies of the same phrase as segments.
export function mergeVoiceSegments(segments: readonly string[]): string {
  return segments.reduce((text, segment) => {
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
    watchdog = setTimeout(complete, 800);
    try { recognition.stop(); } catch { complete(); }
  }
  function resetSilence() { clearTimeout(silence); silence = setTimeout(stop, 3000); }
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
  deadline = setTimeout(stop, 15000);
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
