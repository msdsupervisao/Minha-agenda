import type { AiRuntimeConfig } from '@/lib/assistant/ai-config';

export async function getAssistantAvailability(config: AiRuntimeConfig, request: typeof fetch = fetch) {
  if (config.activeProvider !== 'omniroute') return { provider: config.activeProvider, notice: config.notice, model: config.activeProvider === 'openai' ? config.model : null, gatewayHealthy: null, fallbackConfigured: false };
  try {
    const base = config.baseUrl!.replace(/\/$/, '');
    const headers = config.apiKey ? { authorization: `Bearer ${config.apiKey}` } : undefined;
    const [health, models] = await Promise.all([
      request(`${base.replace(/\/v1$/, '')}/api/health`, { signal: AbortSignal.timeout(4000), cache: 'no-store', redirect: 'error' }),
      request(`${base}/models`, { headers, signal: AbortSignal.timeout(4000), cache: 'no-store', redirect: 'error' }),
    ]);
    const healthBody = await health.json();
    const modelBody = await models.json();
    const gatewayHealthy = health.ok && healthBody.status === 'ok';
    const availableModels = models.ok && Array.isArray(modelBody.data) ? modelBody.data.map((item: { id: string }) => item.id) : null;
    const primaryListed = config.model.startsWith('auto/')
      ? true
      : availableModels ? availableModels.includes(config.model) : null;
    const fallbackModels = config.fallbackModels.length ? config.fallbackModels : (config.fallbackModel ? [config.fallbackModel] : []);
    return {
      provider: 'omniroute', model: config.model, gatewayHealthy, primaryListed,
      fallbackConfigured: fallbackModels.length > 0, fallbackListed: availableModels ? fallbackModels.every((model) => availableModels.includes(model)) : null,
      notice: !gatewayHealthy ? 'Serviço de IA indisponível.' : primaryListed === false ? 'Serviço online; modelo precisa de atenção.' : 'Serviço de IA online.',
    };
  } catch {
    return { provider: 'omniroute', model: config.model, gatewayHealthy: false, notice: 'Serviço de IA indisponível.', fallbackConfigured: Boolean(config.fallbackModels.length || config.fallbackModel) };
  }
}
