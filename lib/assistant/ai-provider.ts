import OpenAI from 'openai';
import { zodTextFormat } from 'openai/helpers/zod';
import { AiStructuredInterpretationSchema, structuredFromAction, validateStructuredInterpretation, type AiStructuredInterpretation } from './ai-schema';
import { interpretCommand } from './interpreter';
import type { AiProviderName, InterpretationContext } from './types';

export type AiTokenUsage = { inputTokens: number; outputTokens: number; totalTokens: number; cachedInputTokens: number };
export type ProviderRequest = { text: string; now: Date; timezone: string; context: InterpretationContext };
export type ProviderResponse = { provider: AiProviderName; model: string | null; interpretation: AiStructuredInterpretation; usage: AiTokenUsage };
export type IntentProvider = { name: AiProviderName; interpret(request: ProviderRequest): Promise<ProviderResponse> };

type ParseResponse = {
  output_parsed?: unknown;
  usage?: { input_tokens?: number; output_tokens?: number; total_tokens?: number; input_tokens_details?: { cached_tokens?: number } } | null;
};
type ResponsesClient = { parse(params: Record<string, unknown>, options?: { signal?: AbortSignal }): Promise<ParseResponse> };

export class AiProviderError extends Error {
  constructor(public code: 'timeout' | 'api_error' | 'invalid_output', message: string) { super(message); this.name = 'AiProviderError'; }
}

export class OpenAIIntentProvider implements IntentProvider {
  readonly name = 'openai' as const;
  private responses: ResponsesClient;

  constructor(private options: { apiKey?: string; model?: string; timeoutMs?: number; responses?: ResponsesClient }) {
    const client = options.responses ? null : new OpenAI({ apiKey: options.apiKey, timeout: options.timeoutMs ?? 8000, maxRetries: 1 });
    this.responses = options.responses || (client!.responses as unknown as ResponsesClient);
  }

  async interpret(request: ProviderRequest): Promise<ProviderResponse> {
    const model = this.options.model || 'gpt-5.4-mini';
    const controller = new AbortController();
    const timeoutMs = this.options.timeoutMs ?? 8000;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const response = await Promise.race([
        this.responses.parse({
          model,
          store: false,
          reasoning: { effort: 'none' },
          input: [
            { role: 'system', content: buildSystemPrompt(request) },
            ...request.context.turns.slice(-10).map((turn) => ({ role: turn.role, content: turn.text })),
            { role: 'user', content: request.text },
          ],
          text: { format: zodTextFormat(AiStructuredInterpretationSchema, 'minha_agenda_intent') },
        }, { signal: controller.signal }),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => { controller.abort(); reject(new AiProviderError('timeout', 'A interpretação da OpenAI excedeu o tempo limite.')); }, timeoutMs);
        }),
      ]);
      if (!response.output_parsed) throw new AiProviderError('invalid_output', 'A OpenAI não retornou uma saída estruturada válida.');
      let interpretation: AiStructuredInterpretation;
      try { interpretation = validateStructuredInterpretation(response.output_parsed); }
      catch { throw new AiProviderError('invalid_output', 'A saída estruturada falhou na validação do servidor.'); }
      return { provider: this.name, model, interpretation, usage: normalizeUsage(response.usage) };
    } catch (error) {
      if (error instanceof AiProviderError) throw error;
      throw new AiProviderError('api_error', 'Não foi possível consultar a OpenAI.');
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
}

export class LocalIntentProvider implements IntentProvider {
  readonly name = 'local' as const;
  async interpret(request: ProviderRequest): Promise<ProviderResponse> {
    const action = interpretCommand(request.text, request.now, request.timezone);
    return { provider: this.name, model: null, interpretation: structuredFromAction(action), usage: emptyUsage() };
  }
}

export function buildSystemPrompt(request: ProviderRequest) {
  return [
    'Você interpreta comandos da aplicação MINHA-AGENDA em português brasileiro.',
    'Retorne apenas a saída estruturada solicitada. Não execute ferramentas, banco de dados ou APIs.',
    `Data e hora atuais do servidor: ${request.now.toISOString()}. Fuso horário: ${request.timezone}.`,
    'Resolva hoje, amanhã, depois de amanhã, dias da semana, semana que vem e mês que vem a partir dessa data.',
    'Para dia da semana sem modificador, use a próxima ocorrência futura. Datas e horários devem ser ISO 8601.',
    'Não invente valores, datas, pessoas ou mensagens. Use null e missing_fields quando faltar dado crítico.',
    'Para um gasto sem valor, mantenha create_expense e amount null. Para lembrete sem data, due_at null.',
    'João e outros nomes são apenas nomes; a aplicação resolverá contatos e homônimos depois.',
    'requires_confirmation é informativo: a política da aplicação toma a decisão final.',
    'Use somente os intents fornecidos pelo schema. Se não houver correspondência segura, use intent null.',
  ].join('\n');
}

function normalizeUsage(usage: ParseResponse['usage']): AiTokenUsage {
  return { inputTokens: usage?.input_tokens || 0, outputTokens: usage?.output_tokens || 0, totalTokens: usage?.total_tokens || 0, cachedInputTokens: usage?.input_tokens_details?.cached_tokens || 0 };
}
function emptyUsage(): AiTokenUsage { return { inputTokens: 0, outputTokens: 0, totalTokens: 0, cachedInputTokens: 0 }; }
