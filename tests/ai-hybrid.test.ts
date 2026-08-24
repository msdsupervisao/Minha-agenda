import test from 'node:test';
import assert from 'node:assert/strict';
import { getAiRuntimeConfig } from '../lib/assistant/ai-config';
import { interpretOnServer } from '../lib/assistant/ai-runtime';

// Modo híbrido local-first: com a OpenAI ativa, o interpretador local resolve
// comandos estruturados sem gastar chamada paga; só cai para a OpenAI quando o
// local não entende.

test('localFirst liga por padrão quando a OpenAI está ativa', () => {
  assert.equal(getAiRuntimeConfig({ OPENAI_API_KEY: 'test-only', AI_PROVIDER: 'openai' }).localFirst, true);
  assert.equal(getAiRuntimeConfig({ OPENAI_API_KEY: 'test-only' }).localFirst, true); // provider deduzido = openai
});

test('AI_LOCAL_FIRST=false desliga o híbrido (tudo OpenAI)', () => {
  assert.equal(getAiRuntimeConfig({ OPENAI_API_KEY: 'test-only', AI_PROVIDER: 'openai', AI_LOCAL_FIRST: 'false' }).localFirst, false);
});

test('modo local puro não usa localFirst (não há OpenAI para poupar)', () => {
  assert.equal(getAiRuntimeConfig({ AI_PROVIDER: 'local', OPENAI_API_KEY: 'test-only' }).localFirst, false);
  assert.equal(getAiRuntimeConfig({}).localFirst, false);
});

test('comando estruturado é resolvido pelo local sem tocar na OpenAI', async () => {
  // apiKey inválida de propósito: se caísse na OpenAI, estouraria erro de rede.
  const config = getAiRuntimeConfig({ OPENAI_API_KEY: 'chave-invalida', AI_PROVIDER: 'openai' });
  const result = await interpretOnServer(
    { text: 'Acabei de gastar R$ 32,50 no posto.', now: new Date(), timezone: 'America/Cuiaba', context: { turns: [], source: 'text' } },
    { config },
  );
  assert.equal(result.provider, 'local');
  assert.equal(result.action?.intent, 'create_expense');
  assert.equal(result.usage.totalTokens, 0); // zero tokens = OpenAI não foi chamada
});
