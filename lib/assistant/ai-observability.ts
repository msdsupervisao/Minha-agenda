import { makeId } from './memory';
import { estimateUsdCost } from './ai-cost';
import type { AiTokenUsage } from './ai-provider';
import type { AiProviderName, Intent } from './types';

export type AiObservation = {
  id: string;
  timestamp: string;
  actionId: string;
  provider: AiProviderName;
  model: string | null;
  intent: Intent | null;
  latencyMs: number;
  result: 'success' | 'empty' | 'error';
  errorCode: string | null;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  cachedInputTokens: number;
  estimatedCostUsd: number | null;
};

const observations = globalThis as typeof globalThis & { __minhaAgendaAiObservations?: AiObservation[] };

export function recordAiObservation(input: Omit<AiObservation, 'id' | 'timestamp' | 'estimatedCostUsd'>) {
  const observation: AiObservation = {
    ...input,
    id: makeId(),
    timestamp: new Date().toISOString(),
    estimatedCostUsd: estimateCost(input.model, input),
  };
  observations.__minhaAgendaAiObservations ||= [];
  observations.__minhaAgendaAiObservations.unshift(observation);
  observations.__minhaAgendaAiObservations = observations.__minhaAgendaAiObservations.slice(0, 500);
  console.info('[minha-agenda:ai]', JSON.stringify(observation));
  return observation;
}

export function readAiObservations() { return [...(observations.__minhaAgendaAiObservations || [])]; }

export function usageFrom(input?: Partial<AiTokenUsage>): AiTokenUsage {
  return { inputTokens: input?.inputTokens || 0, outputTokens: input?.outputTokens || 0, totalTokens: input?.totalTokens || 0, cachedInputTokens: input?.cachedInputTokens || 0 };
}

function estimateCost(model: string | null, usage: Pick<AiObservation, 'inputTokens' | 'outputTokens' | 'cachedInputTokens'>) {
  return estimateUsdCost(model, usage);
}
