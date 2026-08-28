import { App, type URLOpenListenerEvent } from '@capacitor/app';
import { AppLauncher } from '@capacitor/app-launcher';
import { LocalNotifications } from '@capacitor/local-notifications';
import { Share } from '@capacitor/share';
// Regra pura reaproveitada da Agenda (sem duplicar): normalização de telefone BR.
import { normalizeWhatsAppPhone } from '../../lib/assistant/whatsapp-handoff';
import { notificationIdForScheduleCode } from '../../lib/schedule/notification-id';

// A Agenda continua no site; o app só resgata o código e agenda. Builds de teste
// devem definir VITE_API_BASE para não falar acidentalmente com produção.
const API_BASE = apiBase(import.meta.env.VITE_API_BASE);
const SCHEME = 'minhaagenda';

type Handoff = {
  body: string;
  recipientName: string | null;
  phone: string | null;
  dueAt: string;
  status: 'awaiting_device' | 'scheduled_on_device' | 'failed';
  notificationId: number | null;
};

const view = document.getElementById('view') as HTMLElement;

function render(html: string) { view.innerHTML = html; }

function escapeHtml(value: string) {
  return value.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));
}

function formatDue(iso: string) {
  return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'medium', timeStyle: 'short' });
}

// --- Passo 6: no horário, ao tocar a notificação, abrir o WhatsApp ---
// Contato com telefone → conversa direta. Grupo/sem telefone → folha de
// compartilhamento nativa (o WhatsApp mostra a lista de contatos e GRUPOS).
async function openWhatsApp(body: string, phone: string | null, recipientName: string | null) {
  const digits = normalizeWhatsAppPhone(phone);
  if (digits) {
    try {
      const opened = await AppLauncher.openUrl({
        url: `whatsapp://send?phone=${digits}&text=${encodeURIComponent(body)}`,
      });
      if (opened.completed) return;
    } catch {
      // WhatsApp ausente ou deep link indisponível: oferece o compartilhamento.
    }
  }
  await Share.share({
    text: body,
    dialogTitle: recipientName ? `Enviar para ${recipientName}` : 'Escolha o destino no WhatsApp',
  });
}

// --- Passo 4/5: resgata o código na API e agenda a notificação local ---
function extractCode(url: string | undefined | null): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== `${SCHEME}:` || parsed.hostname !== 'schedule') return null;
    return parsed.searchParams.get('code');
  }
  catch { return null; }
}

async function redeem(code: string): Promise<Handoff> {
  const res = await fetch(`${API_BASE}/api/schedule/redeem`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ code }),
  });
  if (!res.ok) {
    const reason = res.status === 410 ? 'Este agendamento já foi usado ou expirou.'
      : res.status === 404 ? 'Agendamento não encontrado.'
      : 'Não consegui resgatar o agendamento.';
    throw new Error(reason);
  }
  return res.json() as Promise<Handoff>;
}

async function acknowledge(code: string, notificationId: number) {
  const res = await fetch(`${API_BASE}/api/schedule/ack`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ code, status: 'scheduled_on_device', notificationId }),
  });
  if (!res.ok) throw new Error('ack_failed');
}

async function reportFailure(code: string, errorCode: 'permission_denied' | 'invalid_time' | 'schedule_failed') {
  try {
    await fetch(`${API_BASE}/api/schedule/ack`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code, status: 'failed', errorCode }),
    });
  } catch {
    // O erro já está visível no aparelho; o código continua válido para retry.
  }
}

async function ensureNotificationPermission(): Promise<boolean> {
  const current = await LocalNotifications.checkPermissions();
  if (current.display === 'granted') return true;
  const asked = await LocalNotifications.requestPermissions();
  return asked.display === 'granted';
}

async function ensureNotificationChannel() {
  try {
    await LocalNotifications.createChannel({
      id: 'schedule',
      name: 'Agendamentos',
      description: 'Avisos de mensagens agendadas',
      importance: 5,
      visibility: 1,
      sound: 'default',
      vibration: true,
    });
  } catch {
    // Channel APIs are unavailable on older Android versions.
  }
}

async function scheduleLocal(handoff: Handoff, code: string) {
  const when = new Date(handoff.dueAt);
  if (!Number.isFinite(when.getTime()) || when.getTime() <= Date.now()) {
    throw new Error('O horário deste agendamento já passou. Volte à Agenda e escolha outro horário.');
  }
  if (!(await ensureNotificationPermission())) {
    throw new Error('Preciso da permissão de notificações para avisar no horário.');
  }
  // O mesmo código sempre produz o mesmo ID. Reabrir o deep link substitui o
  // agendamento anterior em vez de criar notificações duplicadas.
  const id = notificationIdForScheduleCode(code);
  await ensureNotificationChannel();
  const result = await LocalNotifications.schedule({
    notifications: [{
      id,
      title: handoff.recipientName ? `Mensagem para ${handoff.recipientName}` : 'Mensagem agendada',
      // Evita mostrar a mensagem inteira na tela bloqueada.
      body: 'Toque para preparar o envio no WhatsApp.',
      // Exato quando o SO permite; aproximado (Doze) como alternativa.
      schedule: {
        at: when,
        allowWhileIdle: true,
      },
      isExactNotification: true,
      isExactMandatory: false,
      extra: { body: handoff.body, phone: handoff.phone, recipientName: handoff.recipientName },
    }],
  });

  let cleanupPending = false;
  try { await acknowledgeWithRetry(code, id); }
  catch { cleanupPending = true; }

  const timingNotice = result.warning
    ? '<p class="hint">O Android não liberou o alarme exato; o aviso poderá sofrer um pequeno atraso.</p>'
    : '<p class="hint">O Android confirmou o agendamento exato.</p>';
  const cleanupNotice = cleanupPending
    ? '<p class="hint">O aviso foi salvo. O código temporário será eliminado automaticamente.</p>'
    : '';
  render(`
    <div class="card">
      <p class="ok">✅ Agendado.</p>
      <p class="meta">${handoff.recipientName ? escapeHtml(handoff.recipientName) : 'Destino no envio'} · ${formatDue(handoff.dueAt)}</p>
      <p class="body">${escapeHtml(handoff.body)}</p>
      ${timingNotice}
      ${cleanupNotice}
      <p class="hint">No horário, toque na notificação e confirme o envio no WhatsApp.</p>
    </div>`);
}

async function acknowledgeWithRetry(code: string, notificationId: number) {
  let lastError: unknown;
  for (const delay of [0, 400, 1_200]) {
    if (delay) await new Promise((resolve) => window.setTimeout(resolve, delay));
    try { await acknowledge(code, notificationId); return; }
    catch (error) { lastError = error; }
  }
  throw lastError;
}

const handledCodes = new Set<string>();

async function handleCode(code: string) {
  if (handledCodes.has(code)) return;
  handledCodes.add(code);
  render(`<p class="hint">Resgatando e agendando no celular…</p>`);
  try {
    const handoff = await redeem(code);
    if (handoff.status === 'scheduled_on_device') {
      render(`
        <div class="card">
          <p class="ok">✅ Agendamento já confirmado no celular.</p>
          <p class="meta">${handoff.recipientName ? escapeHtml(handoff.recipientName) : 'Destino no envio'} · ${formatDue(handoff.dueAt)}</p>
          <p class="hint">No horário, toque na notificação e confirme o envio no WhatsApp.</p>
        </div>`);
      return;
    }
    await scheduleLocal(handoff, code);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Falha ao agendar.';
    await reportFailure(code, failureCode(message));
    render(`
      <div class="card">
        <p class="error">${escapeHtml(message)}</p>
        <button id="retry" class="primary">Tentar novamente</button>
      </div>`);
    document.getElementById('retry')?.addEventListener('click', () => {
      handledCodes.delete(code);
      void handleCode(code);
    });
  }
}

function apiBase(value: string | undefined) {
  const normalized = value?.trim().replace(/\/$/, '');
  if (!normalized) throw new Error('VITE_API_BASE não configurada para o aplicativo Android.');
  const url = new URL(normalized);
  if (url.protocol !== 'https:' && url.hostname !== 'localhost') {
    throw new Error('VITE_API_BASE precisa usar HTTPS.');
  }
  return url.origin;
}

function failureCode(message: string): 'permission_denied' | 'invalid_time' | 'schedule_failed' {
  if (/permiss/i.test(message)) return 'permission_denied';
  if (/horário|passou/i.test(message)) return 'invalid_time';
  return 'schedule_failed';
}

// --- Registro de listeners (cedo, para pegar tap com o app fechado) ---
LocalNotifications.addListener('localNotificationActionPerformed', (action) => {
  const extra = action.notification.extra as { body?: string; phone?: string | null; recipientName?: string | null } | undefined;
  if (extra?.body) void openWhatsApp(extra.body, extra.phone ?? null, extra.recipientName ?? null);
});

App.addListener('appUrlOpen', (event: URLOpenListenerEvent) => {
  const code = extractCode(event.url);
  if (code) void handleCode(code);
});

// Cold start: o app pode ter sido aberto pelo deep link.
void App.getLaunchUrl().then((launch) => {
  const code = extractCode(launch?.url);
  if (code) void handleCode(code);
});
