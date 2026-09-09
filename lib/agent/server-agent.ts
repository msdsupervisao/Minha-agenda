import type { SupabaseClient } from '@supabase/supabase-js';
import type { Source } from '@/lib/assistant/types';
import { getAiRuntimeConfig } from '@/lib/assistant/ai-config';
import { createSupabasePersonalAgendaStore, type PersonalAgendaStore } from '@/lib/data/agent-personal-repository';
import { loadAgentContext } from './context-builder';
import type { AgentContextState, AgentMessage, AgentProvider, AgentProgress } from './contracts';
import { emptyAgentContextState } from './contracts';
import { AgentOrchestrator } from './orchestrator';
import { OpenAIChatCompletionsAgentProvider } from './providers/openai-chat-completions';
import { OmniRouteAgentProvider } from './providers/omniroute-provider';
import { OpenAIResponsesAgentProvider } from './providers/openai-responses';
import { ToolRegistry } from './tool-registry';
import { createClassTools, createSupabaseClassCatalog, type ClassCatalog } from './tools/classes';
import { createPersonalAgendaTools } from './tools/personal-agenda';
import { createCourseKnowledgeTools } from './tools/course-knowledge';
import { createWeatherTools } from './tools/weather';
import {
  createNoticeScheduleTools,
  createSupabaseScheduleHandoffStore,
  type ScheduleHandoffStore,
} from './tools/notice-schedule';

export function agentPilotEnabled(env: Readonly<Record<string, string | undefined>> = process.env) {
  return env.AGENT_V1_ENABLED?.trim().toLowerCase() === 'true';
}

export async function runAgentPilot(
  client: SupabaseClient,
  userId: string,
  text: string,
  source: Source,
  timezone: string,
  options: {
    env?: Readonly<Record<string, string | undefined>>;
    routeChain?: readonly string[] | null;
    provider?: AgentProvider;
    catalog?: ClassCatalog;
    scheduleStore?: ScheduleHandoffStore;
    personalStore?: PersonalAgendaStore;
    conversation?: AgentMessage[];
    contextState?: AgentContextState;
    resume?: {
      pendingCalls: import('./contracts').AgentToolCall[];
      continuation: unknown;
    };
    now?: Date;
    weatherLocation?: { latitude: number; longitude: number };
    onProgress?: (event: AgentProgress) => void;
  } = {},
) {
  const config = getAiRuntimeConfig(options.env, options.routeChain || null);
  const provider = options.provider || createProvider(config);
  const catalog = options.catalog || createSupabaseClassCatalog(client);
  const loadedContext = options.conversation || options.contextState
    ? null
    : await loadAgentContext(client, userId);
  const conversation = options.conversation || loadedContext?.conversation || [];
  const contextState = options.contextState || loadedContext?.state || emptyAgentContextState();
  const scheduleStore = options.scheduleStore || createSupabaseScheduleHandoffStore(client);
  const registry = new ToolRegistry([
    ...createCourseKnowledgeTools(),
    ...createWeatherTools(),
    ...createClassTools(catalog),
    ...createNoticeScheduleTools(catalog, scheduleStore),
    ...createPersonalAgendaTools(options.personalStore || createSupabasePersonalAgendaStore(client)),
  ]);
  return new AgentOrchestrator(provider, registry, { onProgress: options.onProgress }).run({
    text,
    conversation,
    resume: options.resume,
    context: {
      userId,
      source,
      timezone,
      now: options.now || new Date(),
      state: contextState,
      metadata: options.weatherLocation ? { weatherLocation: options.weatherLocation } : undefined,
    },
  });
}

function createProvider(config: ReturnType<typeof getAiRuntimeConfig>): AgentProvider {
  if (config.activeProvider === 'local' || !config.apiKey) {
    throw new AgentPilotUnavailableError('missing_openai_key');
  }
  const options = {
    apiKey: config.apiKey,
    baseURL: config.baseUrl,
    model: config.model,
    timeoutMs: config.timeoutMs,
  };
  if (config.activeProvider === 'omniroute') return new OmniRouteAgentProvider({ ...options, fallbackModel: config.fallbackModel, fallbackModels: config.fallbackModels });
  return config.baseUrl ? new OpenAIChatCompletionsAgentProvider(options) : new OpenAIResponsesAgentProvider(options);
}

export class AgentPilotUnavailableError extends Error {
  constructor(public readonly code: 'missing_openai_key') {
    super('O piloto do agente precisa de um provedor com suporte a ferramentas.');
    this.name = 'AgentPilotUnavailableError';
  }
}
