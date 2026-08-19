import { NextResponse } from 'next/server';
import { getAiRuntimeConfig } from '@/lib/assistant/ai-config';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function GET() {
  const config = getAiRuntimeConfig();
  return NextResponse.json({ provider: config.activeProvider, notice: config.notice, model: config.activeProvider === 'openai' ? config.model : null, fallbackReason: config.fallbackReason }, { headers: { 'cache-control': 'no-store' } });
}
