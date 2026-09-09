import type { AgentModelExecution, AgentProvider, AgentProviderRequest } from '../contracts';
import { OpenAIChatCompletionsAgentProvider, type OpenAIChatCompletionsAgentProviderOptions } from './openai-chat-completions';
import { isSupportedAiRoute } from '@/lib/assistant/ai-route';

type Options = OpenAIChatCompletionsAgentProviderOptions & {
  fallbackModel?: string | null;
  fallbackModels?: string[];
  makeProvider?: (model: string) => AgentProvider;
  sleep?: (milliseconds: number) => Promise<void>;
};

const TRANSIENT_FORBIDDEN_RETRIES = 1;
const TRANSIENT_FORBIDDEN_RETRY_DELAY_MS = 300;
const sleep = (milliseconds: number) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

export class OmniRouteAgentProvider implements AgentProvider {
  readonly name = 'omniroute';
  private readonly models: string[];
  private selected = 0;

  constructor(private readonly options: Options) {
    const fallbackModels = options.fallbackModels || [];
    this.models = [...new Set([
      options.model || 'gemini/gemini-3.1-flash-lite',
      options.fallbackModel,
      ...fallbackModels,
    ].filter((value): value is string => Boolean(value)))];
    if (this.models.some((model) => !isSupportedAiRoute(model))) {
      throw new Error('A rota do agente aceita slugs do tipo provider/model, incluindo variantes free.');
    }
  }

  async generate(request: AgentProviderRequest) {
    const resumedModel = request.continuation && typeof request.continuation === 'object'
      ? (request.continuation as { routedModel?: unknown }).routedModel : null;
    const resumedIndex = this.models.findIndex((model) => model === resumedModel);
    if (resumedIndex >= 0) this.selected = Math.max(this.selected, resumedIndex);
    const attempts: AgentModelExecution['attempts'] = [];
    models: for (let index = this.selected; index < this.models.length; index++) {
      const model = this.models[index];
      const provider = this.options.makeProvider?.(model) || new OpenAIChatCompletionsAgentProvider({ ...this.options, model, providerName: this.name });
      let forbiddenRetries = 0;
      while (true) try {
        const response = await provider.generate(request);
        this.selected = index;
        attempts.push({ model, status: 'success' });
        return {
          ...response,
          provider: this.name,
          continuation: { ...(response.continuation as object), routedModel: model },
          execution: response.execution ? { ...response.execution, fallbackUsed: index > 0, attempts } : undefined,
        };
      } catch (error) {
        const status = error && typeof error === 'object' ? (error as { status?: number }).status : undefined;
        const code = error && typeof error === 'object' ? (error as { code?: string; name?: string }).code : undefined;
        const name = error instanceof Error ? error.name : '';
        if (name === 'APIConnectionError') throw Object.assign(new Error('gateway_unavailable'), { code: 'gateway_unavailable' });
        attempts.push({ model, status: 'failed', errorCode: status ? `http_${status}` : code || 'provider_error' });
        if (status === 403 && forbiddenRetries < TRANSIENT_FORBIDDEN_RETRIES) {
          forbiddenRetries++;
          console.info('[agent:model-retry]', JSON.stringify({ model, reason: 'http_403', retry: forbiddenRetries }));
          await (this.options.sleep || sleep)(TRANSIENT_FORBIDDEN_RETRY_DELAY_MS);
          continue;
        }
        const retryable = status === 403 || status === 408 || status === 429 || (status !== undefined && status >= 500 && status <= 599)
          || code === 'agent_provider_timeout' || name === 'APIConnectionTimeoutError';
        if (!retryable || index === this.models.length - 1) throw error;
        console.info('[agent:model-fallback]', JSON.stringify({ from: model, to: this.models[index + 1], reason: attempts.at(-1)?.errorCode }));
        continue models;
      }
    }
    throw new Error('agent_provider_unavailable');
  }
}
