type SpeechVoiceLike = { lang: string; name: string };

export function selectPortugueseVoice<T extends SpeechVoiceLike>(voices: readonly T[]): T | null {
  const candidates = voices.filter((voice) => voice.lang.toLowerCase().startsWith('pt'));
  if (!candidates.length) return null;
  return candidates.map((voice, index) => {
    const lang = voice.lang.toLowerCase();
    const name = voice.name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    let score = lang === 'pt-br' || lang === 'pt_br' ? 100 : 50;
    if (name.includes('google')) score += 20;
    if (name.includes('microsoft')) score += 15;
    if (/\b(antonio|felipe|daniel|jorge|ricardo|paulo|male|masculin[oa])\b/.test(name)) score += 35;
    return { voice, score, index };
  }).sort((a, b) => b.score - a.score || a.index - b.index)[0].voice;
}

export function speechTextForReply(text: string, context: { approval?: boolean; message?: boolean } = {}): string {
  if (context.approval) return 'Confira os detalhes na tela. Confirma esta ação?';
  if (context.message) return 'A mensagem está na tela para você conferir.';
  const normalized = text.trim();
  const schedule = normalized.match(/confirmar o agendamento[\s\S]*?\bem\s+([^?]+)\?/i);
  const spoken = schedule?.[1] ? `Horário do agendamento: ${schedule[1].trim()}.` : normalized;
  return stripMarkdownForSpeech(spoken);
}

export function stripMarkdownForSpeech(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/^\s{0,3}>\s?/gm, '')
    .replace(/^\s*(?:[-*+]\s+|\d+[.)]\s+)/gm, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/_([^_]+)_/g, '$1')
    .replace(/~~([^~]+)~~/g, '$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/[0-9#*]\uFE0F?\u20E3/g, ' ')
    .replace(/[\p{Extended_Pictographic}\p{Regional_Indicator}\p{Emoji_Modifier}\uFE0F\uFE0E\u200D\u{E0020}-\u{E007F}]/gu, ' ')
    .replace(/\r?\n+/g, '. ')
    .replace(/[ \t]+/g, ' ')
    .replace(/([:!?])\s*\./g, '$1')
    .replace(/\.{2,}/g, '.')
    .trim();
}
