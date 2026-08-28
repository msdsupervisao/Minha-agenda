import OpenAI from 'openai';
import type {
  AgentProvider,
  AgentProviderRequest,
  AgentProviderResponse,
  AgentTokenUsage,
  AgentToolCall,
  JsonObject,
} from '../contracts';
import { emptyAgentUsage } from '../contracts';

type OpenAIOutputItem = Record<string, unknown> & { type?: string };
type OpenAIResponse = {
  id?: string;
  output_text?: string;
  output?: OpenAIOutputItem[];
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    total_tokens?: number;
    input_tokens_details?: { cached_tokens?: number };
  } | null;
};
type ResponsesClient = {
  create(params: Record<string, unknown>, options?: { signal?: AbortSignal }): Promise<OpenAIResponse>;
};
type OpenAIContinuation = { kind: 'openai_responses'; input: unknown[] };

export class OpenAIResponsesAgentProvider implements AgentProvider {
  readonly name = 'openai';
  private readonly responses: ResponsesClient;

  constructor(private readonly options: {
    apiKey?: string;
    model?: string;
    timeoutMs?: number;
    responses?: ResponsesClient;
  }) {
    const client = options.responses ? null : new OpenAI({
      apiKey: options.apiKey,
      timeout: options.timeoutMs ?? 15000,
      maxRetries: 1,
    });
    this.responses = options.responses || (client!.responses as unknown as ResponsesClient);
  }

  async generate(request: AgentProviderRequest): Promise<AgentProviderResponse> {
    const model = this.options.model || 'gpt-5.4-mini';
    const input = buildInput(request);
    const controller = new AbortController();
    const timeoutMs = this.options.timeoutMs ?? 15000;
    let timer: ReturnType<typeof setTimeout> | undefined;

    try {
      const response = await Promise.race([
        this.responses.create({
          model,
          store: false,
          max_output_tokens: 1600,
          instructions: request.instructions,
          input,
          tools: request.tools.map((tool) => ({
            type: 'function',
            name: tool.name,
            description: tool.description,
            parameters: tool.parameters,
            strict: true,
          })),
          tool_choice: 'auto',
          parallel_tool_calls: false,
        }, { signal: controller.signal }),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => {
            controller.abort();
            reject(new Error('agent_provider_timeout'));
          }, timeoutMs);
        }),
      ]);

      const output = response.output || [];
      return {
        provider: this.name,
        model,
        text: response.output_text || '',
        toolCalls: parseToolCalls(output),
        // Este modelo emite um envelope reasoning vazio mesmo sem consumir
        // reasoning tokens. Não o reenvie em um fluxo stateless (store:false),
        // pois seu id não fica armazenado.
        continuation: {
          kind: 'openai_responses',
          input: [...input, ...output.filter((item) => item.type !== 'reasoning')],
        } satisfies OpenAIContinuation,
        usage: normalizeUsage(response.usage),
      };
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
}
function buildInput(request: AgentProviderRequest): unknown[] {
  const continuation = asContinuation(request.continuation);
  const initial = continuation
    ? continuation.input
    : request.messages.map((message) => ({ role: message.role, content: message.content }));
  const results = (request.toolResults || []).map((result) => ({
    type: 'function_call_output',
    call_id: result.callId,
    output: JSON.stringify(result),
  }));
  return [...initial, ...results];
}

function asContinuation(value: unknown): OpenAIContinuation | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Partial<OpenAIContinuation>;
  return candidate.kind === 'openai_responses' && Array.isArray(candidate.input)
    ? candidate as OpenAIContinuation
    : null;
}

function parseToolCalls(output: OpenAIOutputItem[]): AgentToolCall[] {
  return output.filter((item) => item.type === 'function_call').map((item) => {
    if (typeof item.call_id !== 'string' || typeof item.name !== 'string' || typeof item.arguments !== 'string') {
      throw new Error('agent_provider_invalid_tool_call');
    }
    let parsed: unknown;
    try { parsed = JSON.parse(item.arguments); }
    catch { throw new Error('agent_provider_invalid_tool_arguments'); }
    if (!isJsonObject(parsed)) throw new Error('agent_provider_invalid_tool_arguments');
    return { callId: item.call_id, name: item.name, arguments: parsed };
  });
}

function isJsonObject(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeUsage(usage: OpenAIResponse['usage']): AgentTokenUsage {
  if (!usage) return emptyAgentUsage();
  return {
    inputTokens: usage.input_tokens || 0,
    outputTokens: usage.output_tokens || 0,
    totalTokens: usage.total_tokens || 0,
    cachedInputTokens: usage.input_tokens_details?.cached_tokens || 0,
  };
}
