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

export type OpenAIResponsesAgentProviderOptions = {
  apiKey?: string;
  model?: string;
  timeoutMs?: number;
  baseURL?: string | null;
  responses?: ResponsesClient;
};

export function buildOpenAIResponsesClientOptions(options: OpenAIResponsesAgentProviderOptions) {
  return {
    apiKey: options.apiKey,
    baseURL: options.baseURL?.trim() || undefined,
    timeout: options.timeoutMs ?? 15000,
    maxRetries: 1,
  };
}

export class OpenAIResponsesAgentProvider implements AgentProvider {
  readonly name = 'openai';
  private readonly responses: ResponsesClient;

  constructor(private readonly options: OpenAIResponsesAgentProviderOptions) {
    const client = options.responses ? null : new OpenAI(buildOpenAIResponsesClientOptions(options));
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
        toolCalls: parseToolCalls(output, request.tools),
        // Este modelo emite um envelope reasoning vazio mesmo sem consumir
        // reasoning tokens. Não o reenvie em um fluxo stateless (store:false),
        // pois seu id não fica armazenado.
        continuation: {
          kind: 'openai_responses',
          input: [...input, ...output],
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
    ? continuation.input.filter((item) => !(item && typeof item === 'object' && (item as { type?: unknown }).type === 'reasoning'))
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

function parseToolCalls(
  output: OpenAIOutputItem[],
  toolDescriptors: { name: string; parameters: JsonObject }[],
): AgentToolCall[] {
  return output.filter((item) => item.type === 'function_call').map((item) => {
    if (typeof item.call_id !== 'string' || typeof item.arguments !== 'string') {
      throw new Error('agent_provider_invalid_tool_call');
    }
    let parsed: unknown;
    try { parsed = JSON.parse(item.arguments); }
    catch { throw new Error('agent_provider_invalid_tool_arguments'); }
    if (!isJsonObject(parsed)) throw new Error('agent_provider_invalid_tool_arguments');

    const name = resolveToolName(item, parsed, toolDescriptors);
    if (!name) throw new Error('agent_provider_invalid_tool_call');
    return { callId: item.call_id, name, arguments: parsed };
  });
}

function resolveToolName(
  item: OpenAIOutputItem,
  parsedArguments: JsonObject,
  toolDescriptors: { name: string; parameters: JsonObject }[],
): string | null {
  if (typeof item.name === 'string' && item.name.trim()) return item.name;
  if (toolDescriptors.length === 1) return toolDescriptors[0].name;

  const matches = toolDescriptors.filter((tool) => matchesSchema(parsedArguments, tool.parameters));
  return matches.length === 1 ? matches[0].name : null;
}

function matchesSchema(value: unknown, schema: JsonObject): boolean {
  if (!schema || typeof schema !== 'object' || Array.isArray(schema)) return false;
  if (Array.isArray((schema as { anyOf?: unknown }).anyOf)) {
    return (schema as { anyOf: JsonObject[] }).anyOf.some((candidate) => matchesSchema(value, candidate));
  }
  if (Array.isArray((schema as { oneOf?: unknown }).oneOf)) {
    return (schema as { oneOf: JsonObject[] }).oneOf.some((candidate) => matchesSchema(value, candidate));
  }
  if (Array.isArray((schema as { allOf?: unknown }).allOf)) {
    return (schema as { allOf: JsonObject[] }).allOf.every((candidate) => matchesSchema(value, candidate));
  }

  if (Object.prototype.hasOwnProperty.call(schema, 'enum')) {
    const enumValues = (schema as { enum?: unknown[] }).enum;
    return Array.isArray(enumValues) ? enumValues.some((candidate) => deepEqual(candidate, value)) : false;
  }

  const type = schema.type;
  if (Array.isArray(type)) return type.some((entry) => typeof entry === 'string' && matchesTypedSchema(value, entry, schema));
  if (typeof type === 'string') return matchesTypedSchema(value, type, schema);

  if (schema.properties || schema.required || schema.additionalProperties !== undefined) {
    return matchesTypedSchema(value, 'object', schema);
  }
  return true;
}

function matchesTypedSchema(value: unknown, type: string, schema: JsonObject): boolean {
  switch (type) {
    case 'object':
      return matchesObjectSchema(value, schema);
    case 'array':
      return Array.isArray(value)
        && (!schema.items || value.every((entry) => matchesSchema(entry, schema.items as JsonObject)));
    case 'string':
      return typeof value === 'string';
    case 'number':
      return typeof value === 'number' && Number.isFinite(value);
    case 'integer':
      return typeof value === 'number' && Number.isInteger(value);
    case 'boolean':
      return typeof value === 'boolean';
    case 'null':
      return value === null;
    default:
      return true;
  }
}

function matchesObjectSchema(value: unknown, schema: JsonObject): boolean {
  if (!isJsonObject(value)) return false;
  const properties = isJsonObject(schema.properties) ? schema.properties : {};
  const required = Array.isArray(schema.required)
    ? schema.required.filter((entry): entry is string => typeof entry === 'string')
    : [];

  for (const key of required) {
    if (!Object.prototype.hasOwnProperty.call(value, key)) return false;
  }

  for (const [key, propertySchema] of Object.entries(properties)) {
    if (!Object.prototype.hasOwnProperty.call(value, key)) continue;
    if (!matchesSchema(value[key], propertySchema as JsonObject)) return false;
  }

  if (schema.additionalProperties === false) {
    for (const key of Object.keys(value)) {
      if (!Object.prototype.hasOwnProperty.call(properties, key)) return false;
    }
  } else if (isJsonObject(schema.additionalProperties)) {
    for (const key of Object.keys(value)) {
      if (Object.prototype.hasOwnProperty.call(properties, key)) continue;
      if (!matchesSchema(value[key], schema.additionalProperties as JsonObject)) return false;
    }
  }

  return true;
}

function deepEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) && Array.isArray(right)) {
    return left.length === right.length && left.every((entry, index) => deepEqual(entry, right[index]));
  }
  if (isJsonObject(left) && isJsonObject(right)) {
    const leftKeys = Object.keys(left);
    const rightKeys = Object.keys(right);
    return leftKeys.length === rightKeys.length
      && leftKeys.every((key) => Object.prototype.hasOwnProperty.call(right, key) && deepEqual(left[key], right[key]));
  }
  return false;
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
