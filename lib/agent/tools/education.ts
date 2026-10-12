import { z } from 'zod';
import type { AgentTool, JsonObject } from '../contracts';
import { AgentToolExecutionError } from '../tool-registry';

const QuizQuestionSchema = z.object({
  prompt: z.string().trim().min(1).max(500),
  options: z.array(z.string().trim().min(1).max(250)).length(4),
  correctIndex: z.number().int().min(0).max(3),
}).strict().refine((question) => new Set(question.options.map((option) => option.toLocaleLowerCase('pt-BR'))).size === 4, 'Alternativas repetidas.');

export const QuizDraftSchema = z.object({ questions: z.array(QuizQuestionSchema).min(1).max(10) }).strict();

export type EducationDraft = (input: { kind: 'summary'; source: string } | { kind: 'kahoot'; source: string; count: number }) => Promise<{ body?: string; questions?: unknown }>;

export function createEducationTools(draft?: EducationDraft): AgentTool<JsonObject>[] {
  return [{
    name: 'draft_lesson_summary',
    description: 'Cria um rascunho de resumo didático a partir do conteúdo de aula colado pelo usuário. Use somente quando houver texto-fonte no pedido; se faltar, peça as anotações. Preserve os fatos, sinalize lacunas e não salve nem envie o resultado.',
    risk: 'read',
    inputSchema: z.object({ source: z.string().trim().min(20).max(4000) }).strict(),
    async execute(input) {
      if (!draft) throw new AgentToolExecutionError('draft_unavailable', { message: 'A geração de resumo não está disponível agora.' });
      const source = String(input.source);
      const result = await draft({ kind: 'summary', source });
      const body = result.body?.trim() || '';
      if (!body || body.length > 6000) throw new AgentToolExecutionError('invalid_draft', { message: 'O resumo gerado é inválido.' });
      return { draft: true, kind: 'summary', body };
    },
  }, {
    name: 'draft_kahoot_quiz',
    description: 'Cria um rascunho de questões para Kahoot com quatro alternativas distintas e uma resposta correta por questão, a partir do conteúdo colado pelo usuário. Use somente quando houver texto-fonte; se faltar, peça o conteúdo. Se o usuário não disser quantas questões quer, use count=5. Não salve nem publique o rascunho.',
    risk: 'read',
    inputSchema: z.object({ source: z.string().trim().min(20).max(4000), count: z.number().int().min(1).max(10) }).strict(),
    async execute(input) {
      if (!draft) throw new AgentToolExecutionError('draft_unavailable', { message: 'A geração de questões não está disponível agora.' });
      const count = Number(input.count);
      const result = await draft({ kind: 'kahoot', source: String(input.source), count });
      const parsed = QuizDraftSchema.safeParse({ questions: result.questions });
      if (!parsed.success || parsed.data.questions.length !== count) {
        throw new AgentToolExecutionError('invalid_draft', { message: 'As questões geradas não têm o formato solicitado.' });
      }
      const letters = ['A', 'B', 'C', 'D'];
      const body = parsed.data.questions.map((question, index) => [
        `${index + 1}. ${question.prompt}`,
        ...question.options.map((option, optionIndex) => `${letters[optionIndex]}) ${option}`),
        `Gabarito: ${letters[question.correctIndex]}`,
      ].join('\n')).join('\n\n');
      return { draft: true, kind: 'kahoot', body, count };
    },
  }];
}
