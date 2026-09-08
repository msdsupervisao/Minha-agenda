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

type ChatToolCall = {
  id?: string;
  type?: string;
  function?: {
    name?: string;
    arguments?: string;
  };
};

type ChatMessage = {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content?: string | null;
  tool_calls?: Array<{
    id: string;
    type: 'function';
    function: {
      name: string;
      arguments: string;
    };
  }>;
  tool_call_id?: string;
};

type ChatResponse = {
  model?: string;
  choices?: Array<{
    finish_reason?: string;
    message?: ChatMessage;
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
    prompt_tokens_details?: { cached_tokens?: number };
  } | null;
};

type ChatCompletionsClient = {
  create(params: Record<string, unknown>, options?: { signal?: AbortSignal }): Promise<ChatResponse>;
  createWithResponse?(params: Record<string, unknown>, options?: { signal?: AbortSignal }): Promise<{ data: ChatResponse; response: Response }>;
};

type ChatContinuation = { kind: 'openai_chat'; messages: ChatMessage[] };

export type OpenAIChatCompletionsAgentProviderOptions = {
  apiKey?: string;
  model?: string;
  timeoutMs?: number;
  baseURL?: string | null;
  chat?: ChatCompletionsClient;
  providerName?: string;
};

export function buildOpenAIChatClientOptions(options: OpenAIChatCompletionsAgentProviderOptions) {
  return {
    apiKey: options.apiKey,
    baseURL: options.baseURL?.trim() || undefined,
    timeout: options.timeoutMs ?? 15000,
    maxRetries: 0,
  };
}

export class OpenAIChatCompletionsAgentProvider implements AgentProvider {
  readonly name: string;
  private readonly chat: ChatCompletionsClient;

  constructor(private readonly options: OpenAIChatCompletionsAgentProviderOptions) {
    this.name = options.providerName || 'openai';
    const client = options.chat ? null : new OpenAI(buildOpenAIChatClientOptions(options));
    const sdk = client?.chat.completions as unknown as { create(params: Record<string, unknown>, options?: { signal?: AbortSignal }): Promise<ChatResponse> & { withResponse(): Promise<{ data: ChatResponse; response: Response }> } };
    this.chat = options.chat || {
      create: (params, requestOptions) => sdk.create(params, requestOptions),
      createWithResponse: (params, requestOptions) => sdk.create(params, requestOptions).withResponse(),
    };
  }

  async generate(request: AgentProviderRequest): Promise<AgentProviderResponse> {
    const model = this.options.model || 'gpt-5.4-mini';
    const messages = buildMessages(request);
    const controller = new AbortController();
    const timeoutMs = this.options.timeoutMs ?? 15000;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const startedAt = performance.now();
    let responseHeaders: Headers | undefined;

    try {
      const params = {
          model,
          messages,
          ...(request.tools.length ? { tools: request.tools.map((tool) => ({
            type: 'function',
            function: {
              name: tool.name,
              description: tool.description,
              parameters: tool.parameters,
              strict: true,
            },
          })), tool_choice: 'auto' } : {}),
          temperature: 0,
          stream: false,
        };
      const completion = this.chat.createWithResponse
        ? this.chat.createWithResponse(params, { signal: controller.signal }).then(({ data, response }) => { responseHeaders = response.headers; return data; })
        : this.chat.create(params, { signal: controller.signal });
      const response = await Promise.race([
        completion,
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => {
            controller.abort();
            reject(Object.assign(new Error('agent_provider_timeout'), { code: 'agent_provider_timeout' }));
          }, timeoutMs);
        }),
      ]);

      if (!response.choices?.[0]?.message) throw Object.assign(new Error('agent_provider_invalid_response'), { code: 'agent_provider_invalid_response' });
      if (response.choices[0].finish_reason === 'length') throw Object.assign(new Error('agent_provider_truncated_response'), { code: 'agent_provider_truncated_response' });
      const message = response.choices[0].message;
      const toolCalls = parseToolCalls(message.tool_calls || []);
      return {
        provider: this.name,
        model: response.model || model,
        text: typeof message.content === 'string' ? message.content : '',
        toolCalls,
        continuation: {
          kind: 'openai_chat',
          messages: [...messages, serializeAssistantMessage(message, toolCalls)],
        } satisfies ChatContinuation,
        usage: normalizeUsage(response.usage),
        execution: {
          gateway: this.name,
          requestedModel: model,
          model: response.model || null,
          upstreamProvider: responseHeaders?.get('x-omniroute-provider') || (this.name === 'openai' && !this.options.baseURL ? 'openai' : null),
          providerEvidence: responseHeaders?.get('x-omniroute-provider') ? 'response_header' : this.name === 'openai' && !this.options.baseURL ? 'direct' : 'unavailable',
          latencyMs: Math.round(performance.now() - startedAt),
          requestId: responseHeaders?.get('x-request-id') || null,
          fallbackUsed: false,
          attempts: [{ model, status: 'success' }],
        },
      };
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
}

function buildMessages(request: AgentProviderRequest): ChatMessage[] {
  const continuation = asContinuation(request.continuation);
  const initial = continuation
    ? continuation.messages
    : request.messages.map((message) => ({ role: message.role, content: message.content }));
  const toolMessages = (request.toolResults || []).map((result) => ({
    role: 'tool' as const,
    tool_call_id: result.callId,
    content: JSON.stringify({
      callId: result.callId,
      toolName: result.toolName,
      status: result.status,
      output: result.output,
      verified: result.verified,
      risk: result.risk,
      evidence: result.evidence,
      errorCode: result.errorCode,
    }),
  }));
  // Instructions must be sent on every call, including approval continuations.
  // Keep one current system message; the rest is the complete tool transcript.
  return [{ role: 'system', content: request.instructions }, ...initial.filter((message) => message.role !== 'system'), ...toolMessages];
}

function asContinuation(value: unknown): ChatContinuation | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Partial<ChatContinuation>;
  return candidate.kind === 'openai_chat' && Array.isArray(candidate.messages)
    ? candidate as ChatContinuation
    : null;
}

function parseToolCalls(toolCalls: ChatToolCall[]): AgentToolCall[] {
  return toolCalls.map((item) => {
    if (typeof item.id !== 'string' || typeof item.function?.name !== 'string' || typeof item.function.arguments !== 'string') {
      throw new Error('agent_provider_invalid_tool_call');
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(item.function.arguments);
    } catch {
      throw new Error('agent_provider_invalid_tool_arguments');
    }
    if (!isJsonObject(parsed)) throw new Error('agent_provider_invalid_tool_arguments');
    return { callId: item.id, name: item.function.name, arguments: parsed };
  });
}

function isJsonObject(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function serializeAssistantMessage(
  message: ChatMessage,
  toolCalls: AgentToolCall[],
): ChatMessage {
  if (toolCalls.length === 0) {
    return {
      role: 'assistant',
      content: typeof message.content === 'string' ? message.content : '',
    };
  }
  return {
    role: 'assistant',
    content: typeof message.content === 'string' ? message.content : null,
    tool_calls: toolCalls.map((call) => ({
      id: call.callId,
      type: 'function',
      function: {
        name: call.name,
        arguments: JSON.stringify(call.arguments),
      },
    })),
  };
}

function normalizeUsage(usage: ChatResponse['usage']): AgentTokenUsage {
  if (!usage) return emptyAgentUsage();
  return {
    inputTokens: usage.prompt_tokens || 0,
    outputTokens: usage.completion_tokens || 0,
    totalTokens: usage.total_tokens || 0,
    cachedInputTokens: usage.prompt_tokens_details?.cached_tokens || 0,
  };
}
