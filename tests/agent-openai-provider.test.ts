import assert from 'node:assert/strict';
import test from 'node:test';
import { OpenAIResponsesAgentProvider } from '../lib/agent/providers/openai-responses';
import type { AgentProviderRequest, AgentToolResult } from '../lib/agent/contracts';

const baseRequest: AgentProviderRequest = {
  instructions: 'Use ferramentas e só confirme resultados verificados.',
  messages: [{ role: 'user', content: 'Procura a turma de tecnologia.' }],
  tools: [{
    name: 'find_classes',
    description: 'Busca turmas cadastradas.',
    parameters: {
      type: 'object',
      properties: { query: { type: 'string' } },
      required: ['query'],
      additionalProperties: false,
    },
  }],
};

test('adaptador Responses envia funções estritas e interpreta tool calls', async () => {
  const captured: Record<string, unknown>[] = [];
  const provider = new OpenAIResponsesAgentProvider({
    model: 'gpt-5.4-mini',
    responses: {
      async create(params) {
        captured.push(params);
        return {
          output_text: '',
          output: [
            { type: 'reasoning', id: 'reasoning-1', summary: [] },
            { type: 'function_call', call_id: 'call-1', name: 'find_classes', arguments: '{"query":"tecnologia"}' },
          ],
          usage: { input_tokens: 30, output_tokens: 8, total_tokens: 38, input_tokens_details: { cached_tokens: 4 } },
        };
      },
    },
  });

  const result = await provider.generate(baseRequest);
  assert.equal(result.toolCalls[0].name, 'find_classes');
  assert.deepEqual(result.toolCalls[0].arguments, { query: 'tecnologia' });
  assert.equal(result.usage.cachedInputTokens, 4);

  const request = captured[0];
  assert.equal(request.store, false);
  assert.equal(request.parallel_tool_calls, false);
  assert.equal(request.tool_choice, 'auto');
  const tools = request.tools as Array<{ type: string; strict: boolean; name: string }>;
  assert.deepEqual(tools[0], {
    type: 'function',
    name: 'find_classes',
    description: 'Busca turmas cadastradas.',
    parameters: baseRequest.tools[0].parameters,
    strict: true,
  });
});

test('adaptador preserva output anterior e associa resultado pelo call_id', async () => {
  const captured: Record<string, unknown>[] = [];
  let call = 0;
  const provider = new OpenAIResponsesAgentProvider({
    responses: {
      async create(params) {
        captured.push(params);
        call += 1;
        if (call === 1) {
          return {
            output_text: '',
            output: [
              { type: 'reasoning', id: 'reasoning-1', summary: [] },
              { type: 'function_call', call_id: 'call-1', name: 'find_classes', arguments: '{"query":"tecnologia"}' },
            ],
          };
        }
        return { output_text: 'Encontrei Kids Tecnologia.', output: [{ type: 'message', id: 'message-1' }] };
      },
    },
  });

  const first = await provider.generate(baseRequest);
  const toolResult: AgentToolResult = {
    callId: 'call-1',
    toolName: 'find_classes',
    arguments: { query: 'tecnologia' },
    status: 'success',
    output: [{ id: 'class-1', name: 'Kids Tecnologia' }],
    verified: true,
    risk: 'read',
  };
  const second = await provider.generate({ ...baseRequest, continuation: first.continuation, toolResults: [toolResult] });

  assert.equal(second.text, 'Encontrei Kids Tecnologia.');
  const secondInput = captured[1].input as Array<Record<string, unknown>>;
  assert.ok(secondInput.some((item) => item.type === 'reasoning' && item.id === 'reasoning-1'));
  assert.ok(secondInput.some((item) => item.type === 'function_call' && item.call_id === 'call-1'));
  const output = secondInput.find((item) => item.type === 'function_call_output');
  assert.equal(output?.call_id, 'call-1');
  assert.match(String(output?.output), /Kids Tecnologia/);
});

test('adaptador rejeita argumentos de ferramenta que não sejam JSON válido', async () => {
  const provider = new OpenAIResponsesAgentProvider({
    responses: {
      async create() {
        return { output: [{ type: 'function_call', call_id: 'call-bad', name: 'find_classes', arguments: '{inválido' }] };
      },
    },
  });
  await assert.rejects(() => provider.generate(baseRequest), /invalid_tool_arguments/);
});
