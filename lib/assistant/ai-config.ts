import type { AiProviderName } from './types';
import { normalizeAiRouteChain } from './ai-route';

export type AiRuntimeConfig = {
  requestedProvider: AiProviderName;
  activeProvider: AiProviderName;
  model: string;
  timeoutMs: number;
  apiKey: string | null;
  baseUrl: string | null;
  notice: string;
  fallbackReason: 'missing_api_key' | null;
  localFirst: boolean;
  fallbackModel?: string | null;
  fallbackModels: string[];
};

export function getAiRuntimeConfig(
  env: Readonly<Record<string, string | undefined>> = process.env,
  routeChain: readonly string[] | null = null,
): AiRuntimeConfig {
  const rawProvider = env.AI_PROVIDER?.trim().toLowerCase();
  if (rawProvider && !['openai', 'omniroute', 'local'].includes(rawProvider)) throw new Error('AI_PROVIDER deve ser omniroute, openai ou local.');
  const gateway = rawProvider === 'omniroute';
  const baseUrl = gateway
    ? env.OMNIROUTE_BASE_URL?.trim() || 'http://127.0.0.1:20128/v1'
    : env.OPENAI_BASE_URL?.trim() || env.OMNIROUTE_BASE_URL?.trim() || null;
  if (baseUrl) {
    const url = new URL(baseUrl);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('Base URL de IA inválida.');
  }
  const apiKey = gateway ? env.OMNIROUTE_API_KEY?.trim() || 'local' : env.OPENAI_API_KEY?.trim() || null;
  const requestedProvider: AiProviderName = (rawProvider as AiProviderName | undefined) || (apiKey ? 'openai' : 'local');
  const missingKey = requestedProvider === 'openai' && !apiKey;
  const activeProvider: AiProviderName = missingKey ? 'local' : requestedProvider;
  const parsedTimeout = Number((gateway ? env.OMNIROUTE_TIMEOUT_MS : env.OPENAI_TIMEOUT_MS) || (gateway ? 60000 : 20000));
  // Tool-calling turns can require several seconds; avoid failing healthy
  // production requests just because an old 8s setting is still configured.
  const timeoutMs = Number.isFinite(parsedTimeout) ? Math.max(15000, Math.min(120000, parsedTimeout)) : 20000;
  // Híbrido: com a OpenAI ativa, tenta o interpretador local primeiro e só gasta
  // a OpenAI quando o local não entende. Desligável com AI_LOCAL_FIRST=false.
  const localFirst = activeProvider === 'openai' && env.AI_LOCAL_FIRST?.trim().toLowerCase() !== 'false';
  const allowCookieOverride = env.NODE_ENV !== 'production'
    || env.AI_ROUTE_COOKIE_OVERRIDE?.trim().toLowerCase() === 'true';
  const effectiveChain = allowCookieOverride ? normalizeAiRouteChain(routeChain) : [];
  const defaultGatewayModel = 'gemini/gemini-3.1-flash-lite';
  const defaultFallbackModel = 'groq/openai/gpt-oss-20b';
  const chainPrimary = effectiveChain[0] || null;
  const chainFallbacks = effectiveChain.slice(1);
  const envFallbackModels = parseModelList(env.OMNIROUTE_FALLBACK_MODELS || env.OMNIROUTE_FALLBACK_MODEL || defaultFallbackModel);
  const fallbackModels = gateway
    ? normalizeAiRouteChain([
      ...chainFallbacks,
      ...envFallbackModels,
    ])
    : [];
  return {
    requestedProvider, activeProvider, apiKey, baseUrl,
    model: gateway ? (chainPrimary || env.OMNIROUTE_MODEL?.trim() || defaultGatewayModel) : env.OPENAI_MODEL?.trim() || 'gpt-5.4-mini', timeoutMs,
    fallbackModel: gateway ? fallbackModels[0] || null : null,
    fallbackModels,
    notice: activeProvider === 'local' ? 'Modo local ativo.' : gateway ? 'Assistente conectado.' : 'OpenAI ativa.',
    fallbackReason: missingKey ? 'missing_api_key' : null,
    localFirst,
  };
}

function parseModelList(value: string | undefined): string[] {
  if (!value) return [];
  return [...new Set(value.split(',').map((entry) => entry.trim()).filter(Boolean))];
}
