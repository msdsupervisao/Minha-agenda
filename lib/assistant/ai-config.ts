import type { AiProviderName } from './types';

export type AiRuntimeConfig = {
  requestedProvider: AiProviderName;
  activeProvider: AiProviderName;
  model: string;
  timeoutMs: number;
  apiKey: string | null;
  notice: string;
  fallbackReason: 'missing_api_key' | null;
  localFirst: boolean;
};

export function getAiRuntimeConfig(env: Readonly<Record<string, string | undefined>> = process.env): AiRuntimeConfig {
  const rawProvider = env.AI_PROVIDER?.trim().toLowerCase();
  if (rawProvider && rawProvider !== 'openai' && rawProvider !== 'local') throw new Error('AI_PROVIDER deve ser openai ou local.');
  const apiKey = env.OPENAI_API_KEY?.trim() || null;
  const requestedProvider: AiProviderName = (rawProvider as AiProviderName | undefined) || (apiKey ? 'openai' : 'local');
  const missingKey = requestedProvider === 'openai' && !apiKey;
  const activeProvider: AiProviderName = missingKey ? 'local' : requestedProvider;
  const parsedTimeout = Number(env.OPENAI_TIMEOUT_MS || 8000);
  const timeoutMs = Number.isFinite(parsedTimeout) ? Math.max(1000, Math.min(30000, parsedTimeout)) : 8000;
  // Híbrido: com a OpenAI ativa, tenta o interpretador local primeiro e só gasta
  // a OpenAI quando o local não entende. Desligável com AI_LOCAL_FIRST=false.
  const localFirst = activeProvider === 'openai' && env.AI_LOCAL_FIRST?.trim().toLowerCase() !== 'false';
  return {
    requestedProvider, activeProvider, apiKey,
    model: env.OPENAI_MODEL?.trim() || 'gpt-5.4-mini', timeoutMs,
    notice: activeProvider === 'local' ? 'Modo local ativo.' : 'OpenAI ativa.',
    fallbackReason: missingKey ? 'missing_api_key' : null,
    localFirst,
  };
}
