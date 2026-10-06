import { getAuthenticatedUser } from '@/lib/supabase/auth';
import { getAiRuntimeConfig } from '@/lib/assistant/ai-config';

// TEMPORARY diagnostic: shows which AI backend production actually resolved, whether the AI
// notice composer is enabled, and whether the configured gateway is reachable right now.
// Never returns secret values (only booleans / host). Authenticated — owner only. Remove after.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const user = await getAuthenticatedUser();
  if (!user) return Response.json({ error: 'unauthorized' }, { status: 401 });
  const config = getAiRuntimeConfig();
  const composeEnabled = config.activeProvider !== 'local' && Boolean(config.apiKey);
  let baseUrlHost: string | null = null;
  try { baseUrlHost = config.baseUrl ? new URL(config.baseUrl).host : null; } catch { baseUrlHost = 'invalid'; }
  let gateway: unknown = '(sem baseUrl)';
  if (config.baseUrl) {
    const base = config.baseUrl.replace(/\/$/, '');
    try {
      const response = await fetch(`${base}/models`, {
        headers: config.apiKey ? { authorization: `Bearer ${config.apiKey}` } : undefined,
        signal: AbortSignal.timeout(12000),
        cache: 'no-store',
      });
      gateway = { reachable: true, status: response.status, ok: response.ok };
    } catch (error) {
      gateway = { reachable: false, error: error instanceof Error ? error.message : String(error) };
    }
  }
  return Response.json({
    requestedProvider: config.requestedProvider,
    activeProvider: config.activeProvider,
    model: config.model,
    baseUrlHost,
    hasApiKey: Boolean(config.apiKey),
    composeEnabled,
    notice: config.notice,
    gateway,
  });
}
