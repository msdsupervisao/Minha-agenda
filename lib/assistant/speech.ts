type SpeechVoiceLike = { lang: string; name: string };

export function selectPortugueseVoice<T extends SpeechVoiceLike>(voices: readonly T[]): T | null {
  const candidates = voices.filter((voice) => voice.lang.toLowerCase().startsWith('pt'));
  if (!candidates.length) return null;
  return candidates.map((voice, index) => {
    const lang = voice.lang.toLowerCase();
    const name = voice.name.toLowerCase();
    let score = lang === 'pt-br' || lang === 'pt_br' ? 100 : 50;
    if (name.includes('google')) score += 20;
    if (name.includes('microsoft')) score += 15;
    if (/(francisca|antonio|maria|luciana|felipe|helena|daniel)/.test(name)) score += 10;
    return { voice, score, index };
  }).sort((a, b) => b.score - a.score || a.index - b.index)[0].voice;
}

export function speechTextForReply(text: string): string {
  const normalized = text.trim();
  const schedule = normalized.match(/confirmar o agendamento[\s\S]*?\bem\s+([^?]+)\?/i);
  return schedule?.[1] ? `Horário do agendamento: ${schedule[1].trim()}.` : normalized;
}
