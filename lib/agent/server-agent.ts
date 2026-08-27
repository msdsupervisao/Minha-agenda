import type { SupabaseClient } from '@supabase/supabase-js';
import type { Source } from '@/lib/assistant/types';
import { getAiRuntimeConfig } from '@/lib/assistant/ai-config';
import { loadAgentContext } from './context-builder';
import type { AgentContextState, AgentMessage, AgentProvider } from './contracts';
import { emptyAgentContextState } from './contracts';
import { AgentOrchestrator } from './orchestrator';
import { OpenAIResponsesAgentProvider } from './providers/openai-responses';
import { ToolRegistry } from './tool-registry';
import { createClassTools, createSupabaseClassCatalog, type ClassCatalog } from './tools/classes';
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
    provider?: AgentProvider;
    catalog?: ClassCatalog;
    scheduleStore?: ScheduleHandoffStore;
    conversation?: AgentMessage[];
    contextState?: AgentContextState;
    resume?: {
      pendingCalls: import('./contracts').AgentToolCall[];
      continuation: unknown;
    };
    now?: Date;
  } = {},
) {
  const config = getAiRuntimeConfig(options.env);
  const provider = options.provider || createProvider(config);
  const catalog = options.catalog || createSupabaseClassCatalog(client);
  const loadedContext = options.conversation || options.contextState
    ? null
    : await loadAgentContext(client, userId);
  const conversation = options.conversation || loadedContext?.conversation || [];
  const contextState = options.contextState || loadedContext?.state || emptyAgentContextState();
  const scheduleStore = options.scheduleStore || createSupabaseScheduleHandoffStore(client);
  const registry = new ToolRegistry([
    ...createClassTools(catalog),
    ...createNoticeScheduleTools(catalog, scheduleStore),
  ]);
  return new AgentOrchestrator(provider, registry).run({
    text,
    conversation,
    resume: options.resume,
    context: {
      userId,
      source,
      timezone,
      now: options.now || new Date(),
      state: contextState,
    },
  });
}

function createProvider(config: ReturnType<typeof getAiRuntimeConfig>): AgentProvider {
  if (config.activeProvider !== 'openai' || !config.apiKey) {
    throw new AgentPilotUnavailableError('missing_openai_key');
  }
  return new OpenAIResponsesAgentProvider({
    apiKey: config.apiKey,
    model: config.model,
    timeoutMs: config.timeoutMs,
  });
}

export class AgentPilotUnavailableError extends Error {
  constructor(public readonly code: 'missing_openai_key') {
    super('O piloto do agente precisa de um provedor com suporte a ferramentas.');
    this.name = 'AgentPilotUnavailableError';
  }
}
