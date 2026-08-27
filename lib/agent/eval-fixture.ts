import { z } from 'zod';

const EvalTurnSchema = z.object({
  papel: z.enum(['usuario', 'assistente']),
  fala: z.string().trim().min(1),
  transcricao_ruido: z.string().trim().min(1).optional(),
}).strict();

const EvalExpectedSchema = z.object({
  objetivo: z.string().trim().min(1),
  ferramentas: z.array(z.string().trim().min(1)),
  args_esperados: z.record(z.string(), z.unknown()),
  pedir_confirmacao: z.boolean(),
  deve_perguntar: z.boolean(),
  pergunta_sobre: z.string().trim().min(1).nullable(),
  nunca_inventar: z.array(z.string().trim().min(1)).min(1),
  evidencia_para_sucesso: z.array(z.string().trim().min(1)).min(1),
}).strict();

const EvalCaseSchema = z.object({
  id: z.string().trim().min(1),
  categoria: z.string().trim().min(1),
  descricao: z.string().trim().min(1),
  contexto: z.record(z.string(), z.unknown()).optional(),
  turnos: z.array(EvalTurnSchema).min(1),
  esperado: EvalExpectedSchema,
  observacoes: z.string().trim().min(1).optional(),
}).strict();

export const AgentEvalFixtureSchema = z.object({
  meta: z.object({
    versao: z.string().trim().min(1),
    idioma: z.literal('pt-BR'),
    proposito: z.string().trim().min(1),
    regra_de_correcao: z.string().trim().min(1),
    ferramentas_disponiveis: z.array(z.string().trim().min(1)).min(1),
    mundo: z.record(z.string(), z.unknown()),
  }).strict(),
  casos: z.array(EvalCaseSchema).min(60),
}).strict().superRefine((fixture, context) => {
  const declaredTools = new Set(fixture.meta.ferramentas_disponiveis);
  const seenCaseIds = new Set<string>();
  const usedTools = new Set<string>();

  fixture.casos.forEach((testCase, caseIndex) => {
    if (seenCaseIds.has(testCase.id)) {
      context.addIssue({
        code: 'custom',
        path: ['casos', caseIndex, 'id'],
        message: `ID de caso duplicado: ${testCase.id}`,
      });
    }
    seenCaseIds.add(testCase.id);

    testCase.esperado.ferramentas.forEach((toolName, toolIndex) => {
      usedTools.add(toolName);
      if (!declaredTools.has(toolName)) {
        context.addIssue({
          code: 'custom',
          path: ['casos', caseIndex, 'esperado', 'ferramentas', toolIndex],
          message: `Ferramenta não declarada no catálogo do fixture: ${toolName}`,
        });
      }
    });
  });

  fixture.meta.ferramentas_disponiveis.forEach((toolName, toolIndex) => {
    if (!usedTools.has(toolName)) {
      context.addIssue({
        code: 'custom',
        path: ['meta', 'ferramentas_disponiveis', toolIndex],
        message: `Ferramenta declarada sem nenhum cenário: ${toolName}`,
      });
    }
  });
});

export type AgentEvalFixture = z.infer<typeof AgentEvalFixtureSchema>;
export type AgentEvalCase = AgentEvalFixture['casos'][number];

export function parseAgentEvalFixture(value: unknown): AgentEvalFixture {
  return AgentEvalFixtureSchema.parse(value);
}

export function summarizeAgentEvalFixture(fixture: AgentEvalFixture) {
  const caseIds = new Set(fixture.casos.map((testCase) => testCase.id));
  const usedTools = new Set(fixture.casos.flatMap((testCase) => testCase.esperado.ferramentas));
  const categories = new Set(fixture.casos.map((testCase) => testCase.categoria));
  return {
    cases: fixture.casos.length,
    uniqueCaseIds: caseIds.size,
    declaredTools: fixture.meta.ferramentas_disponiveis.length,
    usedTools: usedTools.size,
    categories: categories.size,
  };
}
