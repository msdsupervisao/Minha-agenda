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

test('baseUrl pode apontar para um gateway OpenAI compatível', () => {
  const config = getAiRuntimeConfig({
    OPENAI_API_KEY: 'test-only',
    AI_PROVIDER: 'openai',
    OMNIROUTE_BASE_URL: 'http://127.0.0.1:20128/v1',
  });
  assert.equal(config.baseUrl, 'http://127.0.0.1:20128/v1');
});

test('gateway omniroute sem configuração explícita começa em Gemini/Groq estáveis', () => {
  const config = getAiRuntimeConfig({ AI_PROVIDER: 'omniroute', OMNIROUTE_API_KEY: 'test-only' });
  assert.equal(config.model, 'gemini/gemini-3.1-flash-lite');
  assert.deepEqual(config.fallbackModels, ['groq/openai/gpt-oss-20b']);
});

test('routeChain em modo não-prod vira primário e fallbacks na ordem correta', () => {
  const config = getAiRuntimeConfig(
    { AI_PROVIDER: 'omniroute', OMNIROUTE_API_KEY: 'test-only', NODE_ENV: 'development' },
    ['groq/openai/gpt-oss-20b', 'gemini/gemini-3.1-flash-lite'],
  );
  assert.equal(config.model, 'groq/openai/gpt-oss-20b');
  assert.deepEqual(config.fallbackModels, ['gemini/gemini-3.1-flash-lite', 'groq/openai/gpt-oss-20b']);
  assert.equal(config.fallbackModel, 'gemini/gemini-3.1-flash-lite');
});

test('routeChain é ignorado em produção quando o override por cookie está bloqueado', () => {
  const config = getAiRuntimeConfig(
    { AI_PROVIDER: 'omniroute', OMNIROUTE_API_KEY: 'test-only', NODE_ENV: 'production' },
    ['groq/openai/gpt-oss-20b', 'gemini/gemini-3.1-flash-lite'],
  );
  assert.equal(config.model, 'gemini/gemini-3.1-flash-lite');
  assert.deepEqual(config.fallbackModels, ['groq/openai/gpt-oss-20b']);
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
