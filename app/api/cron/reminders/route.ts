import { NextResponse } from 'next/server';
import { createServiceClient, serviceConfigured } from '@/lib/supabase/service';
import { pushConfigured, sendPush } from '@/lib/push/send';
import { reminderPushPayload } from '@/lib/push/pure';
import { isCronAuthorized } from '@/lib/push/cron-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function handle(request: Request) {
  if (!isCronAuthorized(request.headers)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!serviceConfigured() || !pushConfigured()) return NextResponse.json({ error: 'not_configured' }, { status: 503 });

  const client = createServiceClient();
  const now = new Date().toISOString();

  const { data: due, error } = await client.from('reminders')
    .select('id,user_id,title,due_at')
    .lte('due_at', now).is('notified_at', null).is('deleted_at', null)
    .order('due_at', { ascending: true }).limit(100);
  if (error) return NextResponse.json({ error: 'load' }, { status: 500 });

  let sent = 0;
  let failed = 0;
  for (const reminder of due || []) {
    const { data: subs } = await client.from('push_subscriptions').select('*').eq('user_id', reminder.user_id);
    for (const s of subs || []) {
      const result = await sendPush(
        { endpoint: String(s.endpoint), p256dh: String(s.p256dh), auth: String(s.auth) },
        reminderPushPayload(String(reminder.title), String(reminder.id)),
      );
      if (result.ok) sent += 1;
      else { failed += 1; if (result.gone) await client.from('push_subscriptions').delete().eq('id', s.id as string); }
    }
    // Marca como notificado mesmo sem inscrição ativa, para não reprocessar em loop.
    await client.from('reminders').update({ notified_at: new Date().toISOString() }).eq('id', reminder.id);
  }

  return NextResponse.json({ ok: true, checked: (due || []).length, sent, failed });
}

export async function POST(request: Request) { return handle(request); }
export async function GET(request: Request) { return handle(request); }
