// A 44-byte silent WAV. Playing it once inside a user gesture "activates" the <audio>
// element so mobile browsers allow the delayed, programmatic playback of TTS clips that
// arrive after the async agent turn. Without this, mobile blocks autoplay and the caller
// silently falls back to the robotic browser voice.
const SILENT_WAV = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAgD4AAIA+AAABAAgAZGF0YQAAAAA=';

export function createSpeechPlayer(fallback: (text: string) => void) {
  let generation = 0;
  let controller: AbortController | null = null;
  let objectUrl: string | null = null;
  const audio = typeof Audio !== 'undefined' ? new Audio() : null;
  if (audio) audio.preload = 'auto';
  let unlocked = false;

  function revoke() {
    if (objectUrl) { URL.revokeObjectURL(objectUrl); objectUrl = null; }
  }
  function stopAudio() {
    if (audio) { audio.onended = audio.onerror = null; audio.pause(); audio.removeAttribute('src'); audio.load(); }
    revoke();
  }
  function cancel() {
    generation++;
    controller?.abort(); controller = null;
    stopAudio();
    window.speechSynthesis?.cancel();
  }
  // Call from a real user gesture (tap mic / submit) so the element is granted playback
  // rights up front; the later play() after the network round-trip then succeeds on mobile.
  function unlock() {
    if (!audio || unlocked) return;
    unlocked = true;
    audio.src = SILENT_WAV;
    const started = audio.play();
    if (started && typeof started.then === 'function') started.then(() => audio.pause()).catch(() => {});
  }
  async function speak(text: string) {
    cancel();
    if (!text) return;
    if (!audio) { fallback(text); return; }
    const current = generation;
    controller = new AbortController();
    const currentController = controller;
    const timeout = window.setTimeout(() => currentController.abort(), 27000);
    try {
      const response = await fetch('/api/tts', { method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text: text.slice(0, 800) }), signal: controller.signal });
      if (!response.ok || !response.headers.get('content-type')?.startsWith('audio/')) throw new Error('tts_unavailable');
      const blob = await response.blob();
      if (generation !== current) return;
      revoke();
      objectUrl = URL.createObjectURL(blob);
      let failed = false;
      const recover = () => {
        if (generation !== current || failed) return;
        failed = true; stopAudio(); fallback(text);
      };
      audio.src = objectUrl;
      audio.onended = () => { if (generation === current) revoke(); };
      audio.onerror = recover;
      await audio.play().catch(recover);
    } catch {
      if (generation === current) { stopAudio(); fallback(text); }
    } finally { window.clearTimeout(timeout); }
  }
  return { speak, cancel, unlock };
}
