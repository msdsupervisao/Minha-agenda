const AI_ROUTE_COOKIE_NAME = 'ma_ai_route_chain';
const SUPPORTED_ROUTE_PATTERN = /^[a-z0-9-]+(?:\/[a-z0-9][a-z0-9._:-]*)+$/i;

export { AI_ROUTE_COOKIE_NAME };

export function isSupportedAiRoute(model: string) {
  return SUPPORTED_ROUTE_PATTERN.test(model) || model.startsWith('auto/');
}

export function normalizeAiRouteChain(models: readonly string[] | null | undefined) {
  if (!models) return [];
  return [...new Set(models.map((model) => model.trim()).filter((model) => model && isSupportedAiRoute(model)))];
}

export function parseAiRouteChainCookieValue(value: string | null | undefined) {
  if (!value) return null;
  try {
    const parsed = JSON.parse(decodeURIComponent(value));
    if (!Array.isArray(parsed)) return null;
    const chain = normalizeAiRouteChain(parsed.filter((entry): entry is string => typeof entry === 'string'));
    return chain.length ? chain : null;
  } catch {
    return null;
  }
}

export function parseAiRouteChainCookieHeader(header: string | null | undefined) {
  if (!header) return null;
  const match = header.match(new RegExp(`(?:^|;\\s*)${AI_ROUTE_COOKIE_NAME}=([^;]+)`));
  return parseAiRouteChainCookieValue(match?.[1] || null);
}

export function serializeAiRouteChainCookieValue(models: readonly string[]) {
  return encodeURIComponent(JSON.stringify(normalizeAiRouteChain(models)));
}
