import type { SupabaseClient } from '@supabase/supabase-js';
import { estimateUsdCost, roundUsd } from '@/lib/assistant/ai-cost';

export type AiUsageSummary = {
  totalCalls: number;
  openaiCalls: number;
  localCalls: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimatedCostUsd: number | null;
  since: string | null;
};

type UsageRow = {
  provider: string; model: string | null;
  input_tokens: number; output_tokens: number; total_tokens: number; cached_input_tokens: number;
  created_at: string;
};

/** Agrega o uso de IA do usuário (RLS já restringe às linhas dele). */
export async function getAiUsageSummary(ctx: { client: SupabaseClient; userId: string }): Promise<AiUsageSummary> {
  const { data, error } = await ctx.client
    .from('ai_usage_logs')
    .select('provider,model,input_tokens,output_tokens,total_tokens,cached_input_tokens,created_at')
    .eq('user_id', ctx.userId)
    .order('created_at', { ascending: true })
    .limit(5000);
  if (error) throw new Error('load:ai_usage');
  return summarizeAiUsage((data || []) as UsageRow[]);
}

/** Pura: soma tokens/custo por provider. Testável isoladamente. */
export function summarizeAiUsage(rows: UsageRow[]): AiUsageSummary {
  let openaiCalls = 0;
  let inputTokens = 0;
  let outputTokens = 0;
  let totalTokens = 0;
  let cost = 0;
  let costKnown = false;

  for (const row of rows) {
    if (row.provider === 'openai') openaiCalls += 1;
    inputTokens += row.input_tokens || 0;
    outputTokens += row.output_tokens || 0;
    totalTokens += row.total_tokens || 0;
    const rowCost = estimateUsdCost(row.model, {
      inputTokens: row.input_tokens || 0, outputTokens: row.output_tokens || 0, cachedInputTokens: row.cached_input_tokens || 0,
    });
    if (rowCost !== null) { cost += rowCost; costKnown = true; }
  }

  return {
    totalCalls: rows.length,
    openaiCalls,
    localCalls: rows.length - openaiCalls,
    inputTokens,
    outputTokens,
    totalTokens,
    estimatedCostUsd: costKnown ? roundUsd(cost) : null,
    since: rows.length ? rows[0].created_at : null,
  };
}
