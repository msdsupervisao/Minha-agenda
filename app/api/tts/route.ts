import { getAuthenticatedUser } from '@/lib/supabase/auth';
import { synthesizeSpeech } from '@/lib/tts/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function POST(request: Request) {
  const user = await getAuthenticatedUser();
  if (!user) return Response.json({ error: 'unauthorized' }, { status: 401 });
  let payload: unknown;
  try {
    const body = await request.text();
    if (body.length > 5000) return Response.json({ error: 'text_too_long' }, { status: 413 });
    payload = JSON.parse(body);
  } catch { return Response.json({ error: 'invalid_json' }, { status: 400 }); }
  const text = payload && typeof payload === 'object' && 'text' in payload ? payload.text : null;
  if (typeof text !== 'string' || !text.trim() || text.length > 800) return Response.json({ error: 'invalid_text' }, { status: 400 });
  try {
    const result = await synthesizeSpeech(user.id, text);
    return new Response(new Uint8Array(result.audio), { headers: {
      'content-type': 'audio/mpeg', 'cache-control': 'private, no-store',
      'x-tts-cache': result.cached ? 'HIT' : 'MISS', 'x-tts-voice': 'elevenlabs',
    } });
  } catch { return Response.json({ error: 'tts_unavailable', fallback: 'browser' }, { status: 503 }); }
}
