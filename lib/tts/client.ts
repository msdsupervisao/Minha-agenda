export function createSpeechPlayer(fallback: (text: string) => void) {
  let generation = 0;
  let controller: AbortController | null = null;
  let audio: HTMLAudioElement | null = null;
  let objectUrl: string | null = null;
  function cleanupAudio() {
    if (audio) { audio.onended = audio.onerror = null; audio.pause(); audio.removeAttribute('src'); audio = null; }
    if (objectUrl) { URL.revokeObjectURL(objectUrl); objectUrl = null; }
  }
  function cancel() {
    generation++;
    controller?.abort(); controller = null;
    cleanupAudio();
    window.speechSynthesis?.cancel();
  }
  async function speak(text: string) {
    cancel();
    if (!text) return;
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
      objectUrl = URL.createObjectURL(blob);
      audio = new Audio(objectUrl);
      let failed = false;
      const recover = () => {
        if (generation !== current || failed) return;
        failed = true; cleanupAudio(); fallback(text);
      };
      audio.onended = cleanupAudio;
      audio.onerror = recover;
      await audio.play().catch(recover);
    } catch {
      if (generation === current) { cleanupAudio(); fallback(text); }
    } finally { window.clearTimeout(timeout); }
  }
  return { speak, cancel };
}
