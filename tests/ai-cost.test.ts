import test from 'node:test';
import assert from 'node:assert/strict';
import { estimateUsdCost } from '../lib/assistant/ai-cost';
import { summarizeAiUsage } from '../lib/data/ai-usage';

test('estimateUsdCost: gpt-5.4-mini calcula por entrada/saída', () => {
  // (1000*0,75 + 1000*4,50) / 1e6 = 0,00525
  assert.equal(estimateUsdCost('gpt-5.4-mini', { inputTokens: 1000, outputTokens: 1000, cachedInputTokens: 0 }), 0.00525);
});

test('estimateUsdCost: tokens em cache custam menos', () => {
  // uncached 600*0,75 + cached 400*0,075 = 450 + 30 = 480 -> 0,00048
  assert.equal(estimateUsdCost('gpt-5.4-mini', { inputTokens: 1000, outputTokens: 0, cachedInputTokens: 400 }), 0.00048);
});

test('estimateUsdCost: modelo desconhecido ou local retorna null', () => {
  assert.equal(estimateUsdCost(null, { inputTokens: 100, outputTokens: 100, cachedInputTokens: 0 }), null);
  assert.equal(estimateUsdCost('outro-modelo', { inputTokens: 100, outputTokens: 100, cachedInputTokens: 0 }), null);
});

test('summarizeAiUsage: soma tokens, separa openai/local e custo', () => {
  const rows = [
    { provider: 'local', model: null, input_tokens: 0, output_tokens: 0, total_tokens: 0, cached_input_tokens: 0, created_at: '2026-08-20T00:00:00Z' },
    { provider: 'openai', model: 'gpt-5.4-mini', input_tokens: 1000, output_tokens: 200, total_tokens: 1200, cached_input_tokens: 0, created_at: '2026-08-21T00:00:00Z' },
    { provider: 'openai', model: 'gpt-5.4-mini', input_tokens: 2000, output_tokens: 100, total_tokens: 2100, cached_input_tokens: 0, created_at: '2026-08-22T00:00:00Z' },
  ];
  const s = summarizeAiUsage(rows);
  assert.equal(s.totalCalls, 3);
  assert.equal(s.openaiCalls, 2);
  assert.equal(s.localCalls, 1);
  assert.equal(s.inputTokens, 3000);
  assert.equal(s.outputTokens, 300);
  assert.equal(s.totalTokens, 3300);
  // 0,00165 + 0,00195 = 0,0036
  assert.equal(s.estimatedCostUsd, 0.0036);
  assert.equal(s.since, '2026-08-20T00:00:00Z');
});

test('summarizeAiUsage: sem linhas → zeros e custo null', () => {
  const s = summarizeAiUsage([]);
  assert.equal(s.totalCalls, 0);
  assert.equal(s.estimatedCostUsd, null);
  assert.equal(s.since, null);
});
