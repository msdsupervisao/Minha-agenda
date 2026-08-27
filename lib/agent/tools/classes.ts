import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import type { SchoolClass } from '@/lib/assistant/types';
import { listClasses } from '@/lib/data/classes-repository';
import type { AgentExecutionContext, AgentTool, JsonObject } from '../contracts';

export type ClassCatalog = {
  list(context: AgentExecutionContext): Promise<SchoolClass[]>;
};

export function createSupabaseClassCatalog(client: SupabaseClient): ClassCatalog {
  return {
    list(context) {
      return listClasses(client, context.userId);
    },
  };
}

export function createClassTools(catalog: ClassCatalog): AgentTool<JsonObject>[] {
  return [
    {
      name: 'find_classes',
      description: 'Pesquisa turmas reais cadastradas por nome, curso ou grupo. Use antes de assumir qual turma o usuário mencionou, inclusive quando a transcrição de voz parecer imprecisa.',
      risk: 'read',
      inputSchema: z.object({ query: z.string().trim().min(1).max(200) }).strict(),
      async execute(input, context) {
        const query = String(input.query);
        const matches = (await catalog.list(context))
          .map((schoolClass) => ({ schoolClass, score: classMatchScore(query, schoolClass) }))
          .filter((candidate) => candidate.score >= 0.2)
          .sort((a, b) => b.score - a.score)
          .slice(0, 5)
          .map(({ schoolClass, score }) => ({
            id: schoolClass.id,
            name: schoolClass.name,
            course: schoolClass.course,
            whatsappGroup: schoolClass.whatsappGroup,
            score,
          }));
        const margin = matches.length > 1 ? Number(matches[0].score) - Number(matches[1].score) : Number(matches[0]?.score || 0);
        return {
          query,
          matches,
          resolution: matches.length === 0
            ? 'none'
            : Number(matches[0].score) >= 0.55 && margin >= 0.15
              ? 'likely_single'
              : 'ambiguous',
        };
      },
    },
    {
      name: 'get_notice_template',
      description: 'Obtém um dos três modelos de aviso de uma turma real. classId deve vir de find_classes; nunca invente o identificador.',
      risk: 'read',
      inputSchema: z.object({
        classId: z.string().uuid(),
        modelNumber: z.number().int().min(1).max(3),
      }).strict(),
      async execute(input, context) {
        const classId = String(input.classId);
        const schoolClass = (await catalog.list(context)).find((item) => item.id === classId);
        if (!schoolClass) return { found: false, classId } as JsonObject;
        const modelNumber = Number(input.modelNumber);
        const body = templateByNumber(schoolClass, modelNumber);
        return {
          found: true,
          class: { id: schoolClass.id, name: schoolClass.name, course: schoolClass.course },
          recipient: schoolClass.whatsappGroup || schoolClass.name,
          modelNumber,
          templateAvailable: Boolean(body),
          body,
        } as JsonObject;
      },
    },
  ];
}

export function classMatchScore(query: string, schoolClass: Pick<SchoolClass, 'name' | 'course' | 'whatsappGroup'>) {
  const needle = normalize(query);
  const haystack = normalize([schoolClass.name, schoolClass.course, schoolClass.whatsappGroup].filter(Boolean).join(' '));
  if (!needle || !haystack) return 0;
  if (needle === haystack) return 1;
  if (haystack.includes(needle)) return 0.92;
  if (needle.includes(haystack)) return 0.88;

  const queryTokens = new Set(needle.split(' ').filter(Boolean));
  const classTokens = new Set(haystack.split(' ').filter(Boolean));
  const overlap = [...queryTokens].filter((token) => classTokens.has(token)).length;
  const coverage = overlap / Math.max(1, queryTokens.size);
  const characterSimilarity = diceCoefficient(bigrams(needle), bigrams(haystack));
  return roundScore(Math.max(coverage * 0.78, characterSimilarity * 0.72));
}

function templateByNumber(schoolClass: SchoolClass, modelNumber: number) {
  if (modelNumber === 1) return schoolClass.noticeTemplateDirect;
  if (modelNumber === 2) return schoolClass.noticeTemplateMotivational;
  if (modelNumber === 3) return schoolClass.noticeTemplateImpactful;
  return null;
}

function normalize(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function bigrams(value: string) {
  const compact = value.replace(/\s+/g, ' ');
  const result = new Set<string>();
  for (let index = 0; index < compact.length - 1; index += 1) result.add(compact.slice(index, index + 2));
  return result;
}

function diceCoefficient(left: Set<string>, right: Set<string>) {
  if (left.size === 0 || right.size === 0) return 0;
  const intersection = [...left].filter((item) => right.has(item)).length;
  return (2 * intersection) / (left.size + right.size);
}

function roundScore(value: number) {
  return Math.round(Math.max(0, Math.min(1, value)) * 1000) / 1000;
}
