import { NextResponse } from 'next/server';
import { createServiceClient, serviceConfigured } from '@/lib/supabase/service';
import {
  whatsappCloudConfig, verifyWebhookChallenge, parseWhatsAppWebhook, normalizePhone,
  type WebhookInbound, type WebhookStatus,
} from '@/lib/assistant/whatsapp-cloud';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Verificação do webhook (a Meta chama uma vez com hub.challenge).
export async function GET(request: Request) {
  const config = whatsappCloudConfig();
  if (!config) return NextResponse.json({ error: 'not_configured' }, { status: 503 });
  const { ok, challenge } = verifyWebhookChallenge(new URL(request.url).searchParams, config.verifyToken);
  if (!ok) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  return new NextResponse(challenge ?? '', { status: 200, headers: { 'content-type': 'text/plain' } });
}

// Recebimento: abre a janela de 24h (last_inbound_at) e marca falhas de entrega.
export async function POST(request: Request) {
  const config = whatsappCloudConfig();
  if (!config) return NextResponse.json({ error: 'not_configured' }, { status: 503 });
  let payload: unknown;
  try { payload = await request.json(); } catch { return NextResponse.json({ ok: true }); }

  const { inbound, statuses } = parseWhatsAppWebhook(payload);
  if (serviceConfigured() && (inbound.length || statuses.length)) {
    try { await persist(inbound, statuses); }
    catch (error) { console.error('[minha-agenda:whatsapp]', error instanceof Error ? error.message : 'erro'); }
  }
  // Sempre 200 para a Meta não reenviar em loop.
  return NextResponse.json({ ok: true });
}

async function persist(inbound: WebhookInbound[], statuses: WebhookStatus[]) {
  const client = createServiceClient();

  if (inbound.length) {
    const { data } = await client.from('contacts').select('id,phone')
      .is('deleted_at', null).not('phone', 'is', null).limit(2000);
    const byPhone = new Map<string, string>();
    for (const row of data || []) byPhone.set(normalizePhone(String((row as { phone: string }).phone)), String((row as { id: string }).id));
    for (const msg of inbound) {
      const id = byPhone.get(normalizePhone(msg.waId));
      if (id) await client.from('contacts').update({ last_inbound_at: msg.timestamp, updated_at: new Date().toISOString() }).eq('id', id);
    }
  }

  const failed = statuses.filter((s) => s.status === 'failed').map((s) => s.id).filter(Boolean);
  if (failed.length) {
    await client.from('messages').update({ status: 'failed', updated_at: new Date().toISOString() }).in('provider_message_id', failed);
  }
}
