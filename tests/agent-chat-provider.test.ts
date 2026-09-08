import assert from 'node:assert/strict';
import test from 'node:test';
import { OpenAIChatCompletionsAgentProvider } from '../lib/agent/providers/openai-chat-completions';
import type { AgentProviderRequest } from '../lib/agent/contracts';

test('provider de chat preserva tool call e encerra após tool output', async () => {
  const chat = new CapturingChatClient();
  const provider = new OpenAIChatCompletionsAgentProvider({
    model: 'gemini/gemini-3.1-flash-lite',
    chat,
  });

  const request: AgentProviderRequest = {
    instructions: 'Use a ferramenta consultar_clima_teste.',
    messages: [{ role: 'user', content: 'Qual o clima de Curitiba?' }],
    tools: [{
      name: 'consultar_clima_teste',
      description: 'Consulta clima de teste.',
      parameters: {
        type: 'object',
        properties: {
          cidade: { type: 'string' },
          unidade: { type: 'string', enum: ['celsius', 'fahrenheit'] },
        },
        required: ['cidade', 'unidade'],
        additionalProperties: false,
      },
    }],
  };

  const first = await provider.generate(request);
  assert.equal(first.toolCalls.length, 1);
  assert.equal(first.toolCalls[0].name, 'consultar_clima_teste');
  assert.equal((chat.calls[0].tools as unknown[]).length, 1);
  assert.deepEqual((chat.calls[0].messages as unknown[])[0], { role: 'system', content: request.instructions });

  const second = await provider.generate({
    ...request,
    continuation: first.continuation,
    toolResults: [{
      callId: first.toolCalls[0].callId,
      toolName: first.toolCalls[0].name,
      arguments: first.toolCalls[0].arguments,
      status: 'success',
      output: { cidade: 'Curitiba', unidade: 'celsius', temperatura: 27, condicao: 'ensolarado' },
      verified: true,
      risk: 'read',
      evidence: { cidade: 'Curitiba', unidade: 'celsius', temperatura: 27, condicao: 'ensolarado' },
    }],
  });

  assert.equal(second.toolCalls.length, 0);
  assert.match(second.text, /Curitiba/);
  const messages = chat.calls[1].messages as Array<{ role: string; content: string }>;
  assert.equal(messages.at(-1)?.role, 'tool');
  assert.equal(messages.filter((message) => message.role === 'system').length, 1);
  assert.equal(messages[0].content, request.instructions);
  assert.equal(JSON.parse(messages.at(-1)!.content).verified, true);
});

class CapturingChatClient {
  calls: Array<Record<string, unknown>> = [];
  private step = 0;

  async create(params: Record<string, unknown>): Promise<{
    model?: string;
    choices: Array<{ message: { role: 'assistant'; content: string | null; tool_calls?: Array<{ id: string; type: 'function'; function: { name: string; arguments: string } }>; } }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number; prompt_tokens_details?: { cached_tokens?: number } };
  }> {
    this.calls.push(params);
    this.step += 1;
    if (this.step === 1) {
      return {
        model: 'gemini/gemini-3.1-flash-lite',
        choices: [{
          message: {
            role: 'assistant',
            content: null,
            tool_calls: [{
              id: 'call_1',
              type: 'function',
              function: {
                name: 'consultar_clima_teste',
                arguments: JSON.stringify({ cidade: 'Curitiba', unidade: 'celsius' }),
              },
            }],
          },
        }],
        usage: emptyAgentUsageChat(),
      };
    }
    return {
      model: 'gemini/gemini-3.1-flash-lite',
      choices: [{
        message: {
          role: 'assistant',
          content: 'Curitiba está a 27°C e ensolarado.',
        },
      }],
      usage: emptyAgentUsageChat(),
    };
  }
}

function emptyAgentUsageChat() {
  return {
    prompt_tokens: 12,
    completion_tokens: 8,
    total_tokens: 20,
    prompt_tokens_details: { cached_tokens: 0 },
  };
}
