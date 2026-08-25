import { App, type URLOpenListenerEvent } from '@capacitor/app';
import { AppLauncher } from '@capacitor/app-launcher';
import { LocalNotifications } from '@capacitor/local-notifications';
import { Share } from '@capacitor/share';
// Regra pura reaproveitada da Agenda (sem duplicar): normalização de telefone BR.
import { normalizeWhatsAppPhone } from '../../lib/assistant/whatsapp-handoff';

// A Agenda continua no site; o app só resgata o código e agenda. Base da API na Vercel.
const API_BASE = 'https://minha-agenda1.vercel.app';
const SCHEME = 'minhaagenda';

type Handoff = { body: string; recipientName: string | null; phone: string | null; dueAt: string };

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

async function acknowledge(code: string) {
  const res = await fetch(`${API_BASE}/api/schedule/ack`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ code }),
  });
  if (!res.ok) throw new Error('ack_failed');
}

async function ensureNotificationPermission(): Promise<boolean> {
  const current = await LocalNotifications.checkPermissions();
  if (current.display === 'granted') return true;
  const asked = await LocalNotifications.requestPermissions();
  return asked.display === 'granted';
}

async function scheduleLocal(handoff: Handoff, code: string) {
  const when = new Date(handoff.dueAt);
  if (!Number.isFinite(when.getTime()) || when.getTime() <= Date.now()) {
    throw new Error('O horário deste agendamento já passou. Volte à Agenda e escolha outro horário.');
  }
  if (!(await ensureNotificationPermission())) {
    throw new Error('Preciso da permissão de notificações para avisar no horário.');
  }
  const id = Math.floor(Math.random() * 2_147_483_000) + 1;
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
  try { await acknowledge(code); }
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

function renderConfirm(handoff: Handoff, code: string) {
  render(`
    <div class="card">
      <p class="meta">${handoff.recipientName ? escapeHtml(handoff.recipientName) : 'Destino escolhido no envio'} · ${formatDue(handoff.dueAt)}</p>
      <p class="body">${escapeHtml(handoff.body)}</p>
      <button id="confirm" class="primary">Agendar no celular</button>
    </div>`);
  document.getElementById('confirm')?.addEventListener('click', async (event) => {
    const button = event.currentTarget as HTMLButtonElement;
    button.disabled = true;
    button.textContent = 'Agendando…';
    try { await scheduleLocal(handoff, code); }
    catch (error) {
      render(`<p class="error">${escapeHtml(error instanceof Error ? error.message : 'Não foi possível agendar.')}</p>`);
    }
  });
}

async function handleCode(code: string) {
  render(`<p class="hint">Resgatando agendamento…</p>`);
  try {
    renderConfirm(await redeem(code), code);
  } catch (error) {
    render(`<p class="error">${escapeHtml(error instanceof Error ? error.message : 'Falha ao resgatar.')}</p>`);
  }
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
