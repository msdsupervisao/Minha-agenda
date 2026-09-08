import { NextResponse } from 'next/server';
import { getAiRuntimeConfig } from '@/lib/assistant/ai-config';
import { parseAiRouteChainCookieHeader } from '@/lib/assistant/ai-route';
import { getAssistantAvailability } from '@/lib/agent/availability';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const config = getAiRuntimeConfig(undefined, parseAiRouteChainCookieHeader(request.headers.get('cookie')));
  return NextResponse.json(await getAssistantAvailability(config), { headers: { 'cache-control': 'no-store' } });
}
