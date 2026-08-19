import { makeId } from './memory';
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
  if (model !== 'gpt-5.4-mini') return null;
  const uncached = Math.max(0, usage.inputTokens - usage.cachedInputTokens);
  return roundUsd((uncached * 0.75 + usage.cachedInputTokens * 0.075 + usage.outputTokens * 4.5) / 1_000_000);
}

function roundUsd(value: number) { return Math.round(value * 100_000_000) / 100_000_000; }
