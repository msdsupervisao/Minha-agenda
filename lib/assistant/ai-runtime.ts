import { actionFromStructured } from './ai-schema';
import { getAiRuntimeConfig, type AiRuntimeConfig } from './ai-config';
import { AiProviderError, LocalIntentProvider, OpenAIIntentProvider, type IntentProvider, type ProviderRequest } from './ai-provider';
import { recordAiObservation, usageFrom } from './ai-observability';
import { makeId } from './memory';
import type { InterpretationResult } from './types';

export type ServerInterpretationResult = InterpretationResult & {
  model: string | null;
  latencyMs: number;
  usage: ReturnType<typeof usageFrom>;
};

export async function interpretOnServer(
  request: ProviderRequest,
  options: { env?: Readonly<Record<string, string | undefined>>; provider?: IntentProvider; config?: AiRuntimeConfig } = {},
): Promise<ServerInterpretationResult> {
  const config = options.config || getAiRuntimeConfig(options.env);

  // Híbrido local-first: com a OpenAI ativa, tenta o interpretador local (grátis
  // e instantâneo) antes de gastar uma chamada paga. Só cai para a OpenAI quando
  // o local não consegue interpretar. Pulado quando um provider é injetado (testes).
  if (config.localFirst && !options.provider) {
    const startedAt = performance.now();
    const response = await new LocalIntentProvider().interpret(request);
    const action = actionFromStructured(response.interpretation, response.provider);
    if (action) {
      const latencyMs = Math.round(performance.now() - startedAt);
      const observation = recordAiObservation({
        actionId: makeId(), provider: response.provider, model: response.model, intent: action.intent,
        latencyMs, result: 'success', errorCode: null, ...response.usage,
      });
      return { action, provider: response.provider, notice: config.notice, observationId: observation.id, model: response.model, latencyMs, usage: response.usage };
    }
  }

  const provider = options.provider || createProvider(config);
  const actionId = makeId();
  const startedAt = performance.now();
  try {
    const response = await provider.interpret(request);
    const action = actionFromStructured(response.interpretation, response.provider);
    const latencyMs = Math.round(performance.now() - startedAt);
    const observation = recordAiObservation({
      actionId, provider: response.provider, model: response.model, intent: action?.intent || null,
      latencyMs, result: action ? 'success' : 'empty', errorCode: null, ...response.usage,
    });
    return { action, provider: response.provider, notice: config.notice, observationId: observation.id, model: response.model, latencyMs, usage: response.usage };
  } catch (error) {
    const latencyMs = Math.round(performance.now() - startedAt);
    const code = error instanceof AiProviderError ? error.code : 'internal_error';
    recordAiObservation({ actionId, provider: provider.name, model: provider.name === 'openai' ? config.model : null, intent: null, latencyMs, result: 'error', errorCode: code, ...usageFrom() });
    throw error;
  }
}

function createProvider(config: AiRuntimeConfig): IntentProvider {
  if (config.activeProvider === 'local') return new LocalIntentProvider();
  return new OpenAIIntentProvider({ apiKey: config.apiKey || undefined, model: config.model, timeoutMs: config.timeoutMs });
}
