// A short, VALID silent MP3 (~0.4s). Playing it once inside a real user gesture "blesses"
// the single <audio> element so mobile browsers allow the delayed, programmatic playback of
// the TTS clips that arrive after the async agent turn. A zero-frame WAV does not actually
// start playback on mobile, so the element never gets blessed and the real play() is blocked,
// silently falling back to the robotic browser voice. MP3 is also the format the TTS returns.
const SILENT_MP3 = 'data:audio/mpeg;base64,SUQzBAAAAAAAIlRTU0UAAAAOAAADTGF2ZjYzLjEuMTAxAAAAAAAAAAAAAAD/+0DAAAAAAAAAAAAAAAAAAAAAAABJbmZvAAAADwAAABEAAAeeACUlJSUlMzMzMzMzQEBAQEBATk5OTk5OXFxcXFxcaWlpaWlpd3d3d3d3hYWFhYWFkpKSkpKgoKCgoKCurq6urq67u7u7u7vJycnJycnX19fX19fk5OTk5OTy8vLy8vL//////wAAAABMYXZjNjMuMS4AAAAAAAAAAAAAAAAkBVgAAAAAAAAHnhDRAIgAAAAAAP/7EMQAA8AAAaQAAAAgAAA0gAAABExBTUUzLjEwMFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVMQU1FMy4xMDBVVVVV//sQxCmDwAABpAAAACAAADSAAAAEVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVUxBTUUzLjEwMFVVVVX/+xDEUwPAAAGkAAAAIAAANIAAAARVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVTEFNRTMuMTAwVVVVVf/7EMR8g8AAAaQAAAAgAAA0gAAABFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVMQU1FMy4xMDBVVVVV//sQxKYDwAABpAAAACAAADSAAAAEVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVUxBTUUzLjEwMFVVVVX/+xDEz4PAAAGkAAAAIAAANIAAAARVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVTEFNRTMuMTAwVVVVVf/7EMTWA8AAAaQAAAAgAAA0gAAABFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVMQU1FMy4xMDBVVVVV//sQxNYDwAABpAAAACAAADSAAAAEVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVUxBTUUzLjEwMFVVVVX/+xDE1gPAAAGkAAAAIAAANIAAAARVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVTEFNRTMuMTAwVVVVVf/7EMTWA8AAAaQAAAAgAAA0gAAABFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVMQU1FMy4xMDBVVVVV//sQxNYDwAABpAAAACAAADSAAAAEVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVUxBTUUzLjEwMFVVVVX/+xDE1gPAAAGkAAAAIAAANIAAAARVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVf/7EMTWA8AAAaQAAAAgAAA0gAAABFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV//sQxNYDwAABpAAAACAAADSAAAAEVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVX/+xDE1gPAAAGkAAAAIAAANIAAAARVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVf/7EMTWA8AAAaQAAAAgAAA0gAAABFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV//sQxNYDwAABpAAAACAAADSAAAAEVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVU=';

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
  // Mark as unlocked ONLY when playback actually starts — if the browser blocks it, stay
  // locked so the next gesture retries instead of giving up and falling back forever.
  function unlock() {
    if (!audio || unlocked) return;
    audio.src = SILENT_MP3;
    const started = audio.play();
    if (started && typeof started.then === 'function') {
      started.then(() => { unlocked = true; audio.pause(); }).catch(() => {});
    } else {
      unlocked = true;
    }
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
