// Preço do modelo e cálculo de custo — puro, sem dependência de servidor.
// Fonte única usada pela observabilidade e pela tela de Consumo.

export type TokenCounts = { inputTokens: number; outputTokens: number; cachedInputTokens: number };

// USD por 1 milhão de tokens (gpt-5.4-mini).
export const MODEL_PRICING_USD_PER_MILLION: Record<string, { input: number; cachedInput: number; output: number }> = {
  'gpt-5.4-mini': { input: 0.75, cachedInput: 0.075, output: 4.5 },
};

/** Custo estimado em USD; null se o modelo não tiver tabela de preço. */
export function estimateUsdCost(model: string | null, usage: TokenCounts): number | null {
  const price = model ? MODEL_PRICING_USD_PER_MILLION[model] : undefined;
  if (!price) return null;
  const uncached = Math.max(0, usage.inputTokens - usage.cachedInputTokens);
  return roundUsd((uncached * price.input + usage.cachedInputTokens * price.cachedInput + usage.outputTokens * price.output) / 1_000_000);
}

export function roundUsd(value: number) {
  return Math.round(value * 100_000_000) / 100_000_000;
}
