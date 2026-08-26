import { normalize } from '@/lib/assistant/memory';
import type { SchoolClass } from '@/lib/assistant/types';

export type NoticeModelKey = 'direct' | 'motivational' | 'impactful';

export type NoticeModel = {
  key: NoticeModelKey;
  number: 1 | 2 | 3;
  label: string;
  body: string;
};

export type ResolvedWeeklyNotice = {
  classId: string;
  className: string;
  recipientName: string;
  models: NoticeModel[];
};

const COMMAND_PREFIX = /^(?:carregue\s+)?(?:o\s+|a\s+)?(?:avisos?|mensage(?:m|ns))\s+(?:de|da|do)\s+/iu;
const EXPLICIT_MODEL = /\bmodelo\s+(?:1|2|3|um|uma|dois|duas|tres)\b/u;
const WHEN_WORD = /\b(?:hoje|amanha|domingo|segunda|terca|quarta|quinta|sexta|sabado)\b/u;

export function isWeeklyNoticeCommand(input: string) {
  const clean = normalize(input.trim());
  // Na conversa natural o usuário costuma dizer primeiro o curso, por exemplo
  // "Designer Gráfico modelo 2 hoje às 19h". O número explícito do modelo é
  // suficiente para distinguir esse atalho de um lembrete ou evento comum.
  return COMMAND_PREFIX.test(clean) || EXPLICIT_MODEL.test(clean);
}

export function requestedNoticeModelNumber(input: string): 1 | 2 | 3 | null {
  const clean = normalize(input);
  const beforeWhen = clean.split(WHEN_WORD)[0];
  const matches = [...beforeWhen.matchAll(/\b(?:modelo\s+)?(1|2|3|um|uma|dois|duas|tres)\b/gu)];
  const value = matches.at(-1)?.[1];
  if (value === '1' || value === 'um' || value === 'uma') return 1;
  if (value === '2' || value === 'dois' || value === 'duas') return 2;
  if (value === '3' || value === 'tres') return 3;
  return null;
}

export function noticeQueryFromCommand(input: string) {
  return normalize(input.trim())
    .replace(COMMAND_PREFIX, '')
    .split(WHEN_WORD)[0]
    .replace(/\b(?:modelo\s+)?(?:1|2|3|um|uma|dois|duas|tres)\b/gu, ' ')
    .replace(/\b(?:carregue|aviso|mensagem|modelo|de|da|do|a|o)\b/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function resolveWeeklyNotice(classes: SchoolClass[], input: string): ResolvedWeeklyNotice | null {
  const query = noticeQueryFromCommand(input);
  if (!query) return null;

  const ranked = classes.map((schoolClass, index) => {
    const name = normalize(schoolClass.name);
    const course = normalize(schoolClass.course || '');
    const haystack = `${name} ${course}`.trim();
    let score = 0;
    if (name === query || course === query) score = 100;
    else if (name.startsWith(query) || course.startsWith(query)) score = 80;
    else if (haystack.includes(query)) score = 60;
    else {
      const queryTokens = query.split(/\s+/).filter((token) => token.length >= 3);
      const words = haystack.split(/\s+/);
      const matched = queryTokens.filter((token) => words.some((word) => word.includes(token) || word.startsWith(token) || token.startsWith(word)));
      if (matched.length) score = 20 + matched.length;
    }
    return { schoolClass, score, index };
  }).filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index);

  const schoolClass = ranked[0]?.schoolClass;
  if (!schoolClass) return null;
  return {
    classId: schoolClass.id,
    className: schoolClass.course || schoolClass.name,
    recipientName: schoolClass.whatsappGroup || `grupo ${schoolClass.name}`,
    models: classNoticeModels(schoolClass),
  };
}

export function classNoticeModels(schoolClass: SchoolClass): NoticeModel[] {
  return [
    { key: 'direct', number: 1, label: 'Direto', body: schoolClass.noticeTemplateDirect || '' },
    { key: 'motivational', number: 2, label: 'Motivacional', body: schoolClass.noticeTemplateMotivational || '' },
    { key: 'impactful', number: 3, label: 'Impactante', body: schoolClass.noticeTemplateImpactful || '' },
  ];
}

export function defaultNoticeTemplates(courseOrClass: string) {
  const subject = courseOrClass.trim() || 'sua turma';
  const clean = normalize(subject);

  if (clean.includes('kids')) {
    return {
      noticeTemplateDirect: `📢 Aviso — ${subject}\n\nOlá, famílias! Amanhã teremos aula de ${subject}, no horário habitual. Contamos com a presença das crianças!`,
      noticeTemplateMotivational: `🚀 Amanhã é dia de aprender brincando em ${subject}! Teremos novas descobertas, criatividade e muita tecnologia. Esperamos nossos pequenos para mais uma aula especial!`,
      noticeTemplateImpactful: `✨ Cada encontro ajuda a criança a desenvolver criatividade, raciocínio e confiança. Amanhã teremos ${subject}; não deixe seu pequeno perder essa etapa da nossa jornada!`,
    };
  }

  if (clean.includes('design')) {
    return {
      noticeTemplateDirect: `🎨 Aviso — Aula de ${subject}\n\nAmanhã teremos aula de ${subject}, no horário habitual. Prepare seu material e não falte!`,
      noticeTemplateMotivational: `🎨🚀 Fala, designers! Amanhã temos aula de ${subject}. É mais uma oportunidade de praticar, aprender novas técnicas e transformar ideias em grandes projetos. Esperamos vocês! 🔥`,
      noticeTemplateImpactful: `⚡ Criatividade também se constrói com constância. Amanhã teremos ${subject}, e cada aula amplia seu repertório e sua liberdade para criar. Não perca essa evolução! 🎨`,
    };
  }

  if (clean.includes('informat')) {
    return {
      noticeTemplateDirect: `💻 Aviso — ${subject}\n\nAmanhã teremos aula de ${subject}, no horário habitual. Contamos com a presença de todos!`,
      noticeTemplateMotivational: `🚀 Amanhã é dia de avançar em ${subject}! Cada nova habilidade abre possibilidades para estudar, trabalhar e criar com mais autonomia. Esperamos vocês!`,
      noticeTemplateImpactful: `⚡ Tecnologia se aprende praticando. Amanhã teremos ${subject}; faltar significa perder uma etapa importante do conteúdo e da evolução da turma. Não faltem! 💻`,
    };
  }

  return {
    noticeTemplateDirect: `📢 Aviso — ${subject}\n\nOlá! Amanhã teremos aula de ${subject}, no horário habitual. Contamos com a presença de todos!`,
    noticeTemplateMotivational: `🚀 Amanhã é dia de aprender e evoluir em ${subject}! Cada aula traz uma nova oportunidade de praticar, descobrir e avançar. Esperamos todos vocês!`,
    noticeTemplateImpactful: `⚡ Cada aula faz diferença. Amanhã teremos ${subject}, e a presença é importante para acompanhar a turma e não perder nenhuma etapa do aprendizado. Não faltem!`,
  };
}
