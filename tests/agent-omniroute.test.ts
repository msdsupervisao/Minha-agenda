import assert from 'node:assert/strict';
import test from 'node:test';
import type { AgentProviderRequest, AgentProviderResponse } from '../lib/agent/contracts';
import { emptyAgentUsage } from '../lib/agent/contracts';
import { OmniRouteAgentProvider } from '../lib/agent/providers/omniroute-provider';
import { OpenAIChatCompletionsAgentProvider } from '../lib/agent/providers/openai-chat-completions';
import { getAiRuntimeConfig } from '../lib/assistant/ai-config';
import { getAssistantAvailability } from '../lib/agent/availability';

const primary = 'gemini/gemini-3.1-flash-lite';
const fallback = 'groq/openai/gpt-oss-20b';
const request: AgentProviderRequest = { instructions: 'Use dados reais.', messages: [{ role: 'user', content: 'Consulte.' }], tools: [], continuation: { kind: 'openai_chat', messages: [{ role: 'assistant', tool_calls: [{ id: 'call-1', type: 'function', function: { name: 'read', arguments: '{}' } }] }] }, toolResults: [{ callId: 'call-1', toolName: 'read', arguments: {}, status: 'success', output: { value: 42 }, verified: true, risk: 'read' }] };
const response = (model: string): AgentProviderResponse => ({ provider: 'omniroute', model, text: '42', toolCalls: [], usage: emptyAgentUsage(), continuation: { kind: 'openai_chat', messages: [] }, execution: { gateway: 'omniroute', requestedModel: model, model, upstreamProvider: 'groq', providerEvidence: 'response_header', latencyMs: 10, requestId: null, fallbackUsed: false, attempts: [] } });

test('fallback por quota preserva instruções, ferramentas, continuação e resultados, e mantém a rota na retomada', async () => {
  const attempts: string[] = [];
  const seen: AgentProviderRequest[] = [];
  const options = { model: primary, fallbackModel: fallback, makeProvider: (model: string) => ({ name: model, async generate(input: AgentProviderRequest) { attempts.push(model); seen.push(input); if (model === primary) throw Object.assign(new Error('quota'), { status: 429 }); return response(model); } }) };
  const provider = new OmniRouteAgentProvider(options);
  const first = await provider.generate(request);
  assert.deepEqual(attempts, [primary, fallback]);
  assert.equal(seen[0], request);
  assert.equal(seen[1], request);
  assert.equal(first.execution?.fallbackUsed, true);
  assert.deepEqual(first.execution?.attempts, [{ model: primary, status: 'failed', errorCode: 'http_429' }, { model: fallback, status: 'success' }]);
  await new OmniRouteAgentProvider(options).generate({ ...request, continuation: first.continuation });
  assert.deepEqual(attempts, [primary, fallback, fallback]);
});

test('autenticação, argumentos inválidos e gateway fora do ar não provocam troca de modelo', async () => {
  for (const error of [Object.assign(new Error('auth'), { status: 401 }), Object.assign(new Error('schema'), { status: 400 }), new Error('agent_provider_invalid_tool_arguments'), Object.assign(new Error('offline'), { name: 'APIConnectionError' })]) {
    let calls = 0;
    const provider = new OmniRouteAgentProvider({ model: primary, fallbackModel: fallback, makeProvider: (model) => ({ name: model, async generate() { calls++; throw error; } }) });
    await assert.rejects(provider.generate(request));
    assert.equal(calls, 1);
  }
  assert.doesNotThrow(() => new OmniRouteAgentProvider({
    model: 'gemini/gemini-3.1-flash-lite',
    fallbackModels: ['groq/openai/gpt-oss-20b'],
  }));
});

test('rota automática preserva tools e identifica a rota solicitada na continuação', async () => {
  let receivedModel = '';
  let receivedRequest: AgentProviderRequest | undefined;
  const provider = new OmniRouteAgentProvider({
    model: 'auto/chat',
    makeProvider: (model) => ({
      name: model,
      async generate(input: AgentProviderRequest) {
        receivedModel = model;
        receivedRequest = input;
        return response('openai/gpt-oss-120b');
      },
    }),
  });
  const result = await provider.generate(request);
  assert.equal(receivedModel, 'auto/chat');
  assert.equal(receivedRequest, request);
  assert.equal(result.continuation && typeof result.continuation === 'object' ? (result.continuation as { routedModel?: string }).routedModel : undefined, 'auto/chat');
  assert.equal(result.model, 'openai/gpt-oss-120b');
});

test('provider efetivo vem do header da resposta e não é inferido do nome solicitado', async () => {
  const provider = new OpenAIChatCompletionsAgentProvider({ model: primary, providerName: 'omniroute', chat: {
    async create() { throw new Error('not_used'); },
    async createWithResponse() { return { data: { model: 'actual-model', choices: [{ message: { role: 'assistant', content: 'Olá.' } }] }, response: new Response(null, { headers: { 'x-omniroute-provider': 'gemini', 'x-request-id': 'request-test' } }) }; },
  } });
  const result = await provider.generate({ ...request, continuation: undefined, toolResults: undefined });
  assert.equal(result.execution?.upstreamProvider, 'gemini');
  assert.equal(result.execution?.model, 'actual-model');
  assert.equal(result.execution?.providerEvidence, 'response_header');
  assert.equal(result.execution?.requestId, 'request-test');
  const noHeader = new OpenAIChatCompletionsAgentProvider({ model: primary, providerName: 'omniroute', chat: { async create() { return { choices: [{ message: { role: 'assistant', content: 'Olá.' } }] }; } } });
  assert.equal((await noHeader.generate(request)).execution?.upstreamProvider, null);
});

test('status consulta saúde e catálogo, sem gerar texto ou exibir credenciais', async () => {
  const config = getAiRuntimeConfig({ AI_PROVIDER: 'omniroute', OMNIROUTE_API_KEY: 'test-private-value', OMNIROUTE_FALLBACK_MODELS: `${fallback}` });
  assert.equal(config.localFirst, false);
  assert.deepEqual(config.fallbackModels, [fallback]);
  const urls: string[] = [];
  const status = await getAssistantAvailability(config, (async (url) => { urls.push(String(url)); return Response.json(String(url).endsWith('/models') ? { data: [{ id: primary }, { id: fallback }] } : { status: 'ok' }); }) as typeof fetch);
  assert.deepEqual(urls.sort(), ['http://127.0.0.1:20128/api/health', 'http://127.0.0.1:20128/v1/models']);
  assert.equal(status.gatewayHealthy, true);
  assert.doesNotMatch(JSON.stringify(status), /test-private-value/);
  const offline = await getAssistantAvailability(config, async () => { throw new Error('offline'); });
  assert.equal(offline.gatewayHealthy, false);
});

test('status considera rota auto válida sem exigir que ela apareça no catálogo', async () => {
  const config = getAiRuntimeConfig({ AI_PROVIDER: 'omniroute', OMNIROUTE_MODEL: 'auto/chat' });
  const mockFetch: typeof fetch = async (url) => Response.json(
    String(url).endsWith('/models') ? { data: [] } : { status: 'ok' },
  );
  const status = await getAssistantAvailability(config, mockFetch);
  assert.equal(status.gatewayHealthy, true);
  assert.equal(status.primaryListed, true);
  assert.equal(status.notice, 'Serviço de IA online.');
});

test('configuração stable-first aceita cadeia explícita de produção', () => {
  const config = getAiRuntimeConfig({
    AI_PROVIDER: 'omniroute',
    OMNIROUTE_MODEL: 'gemini/gemini-3.1-flash-lite',
    OMNIROUTE_FALLBACK_MODELS: 'groq/openai/gpt-oss-20b, groq/openai/gpt-oss-20b ',
  });
  assert.equal(config.model, 'gemini/gemini-3.1-flash-lite');
  assert.deepEqual(config.fallbackModels, ['groq/openai/gpt-oss-20b']);
});
