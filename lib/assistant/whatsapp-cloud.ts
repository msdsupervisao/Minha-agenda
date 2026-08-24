// Integração real com a WhatsApp Cloud API (envio dentro da janela de 24h).
// Helpers puros (testáveis sem rede) + serviço que faz o POST no Graph.
import { OperationalMemoryRepository } from './memory';
import { MockWhatsAppService, type WhatsAppService } from './whatsapp-service';
import type { Contact, Message } from './types';

const GRAPH_VERSION = 'v21.0';

export type WhatsAppCloudConfig = { accessToken: string; phoneNumberId: string; verifyToken: string; graphVersion?: string };

/** Config só é válida com WHATSAPP_MODE=cloud e as três credenciais presentes. */
export function whatsappCloudConfig(env: Readonly<Record<string, string | undefined>> = process.env): WhatsAppCloudConfig | null {
  const accessToken = env.WHATSAPP_ACCESS_TOKEN?.trim();
  const phoneNumberId = env.WHATSAPP_PHONE_NUMBER_ID?.trim();
  const verifyToken = env.WHATSAPP_VERIFY_TOKEN?.trim();
  const enabled = env.WHATSAPP_MODE?.trim().toLowerCase() === 'cloud';
  if (!enabled || !accessToken || !phoneNumberId || !verifyToken) return null;
  return { accessToken, phoneNumberId, verifyToken };
}

export function whatsappCloudConfigured(env: Readonly<Record<string, string | undefined>> = process.env) {
  return whatsappCloudConfig(env) !== null;
}

/** Telefone só com dígitos (E.164 sem símbolos), como a Cloud API espera em `to`. */
export function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, '');
}

/** Regras da Meta para mensagem livre (janela de 24h). Sem template no v1. */
export function whatsappSendAllowed(message: Message, contact: Contact | null): { allowed: boolean; reason: string } {
  if (!contact) return { allowed: false, reason: 'Contato desconhecido; cadastre a pessoa antes de enviar.' };
  if (!contact.phone) return { allowed: false, reason: 'O contato não tem telefone cadastrado.' };
  if (!contact.whatsappOptIn) return { allowed: false, reason: 'O contato ainda não deu opt-in para mensagens no WhatsApp.' };
  if (message.requiresTemplate) return { allowed: false, reason: 'Fora da janela de 24h: exigiria um template aprovado, ainda não configurado.' };
  return { allowed: true, reason: 'Dentro da janela de 24h.' };
}

export function buildWhatsAppTextPayload(phone: string, body: string) {
  return { messaging_product: 'whatsapp', recipient_type: 'individual', to: normalizePhone(phone), type: 'text', text: { preview_url: false, body } };
}

/** Verificação do webhook (GET da Meta): devolve o challenge se o token bater. */
export function verifyWebhookChallenge(params: URLSearchParams, verifyToken: string): { ok: boolean; challenge: string | null } {
  const mode = params.get('hub.mode');
  const token = params.get('hub.verify_token');
  const challenge = params.get('hub.challenge');
  if (mode === 'subscribe' && token != null && token === verifyToken) return { ok: true, challenge };
  return { ok: false, challenge: null };
}

export type WebhookInbound = { waId: string; text: string | null; timestamp: string };
export type WebhookStatus = { id: string; status: string; timestamp: string };

/** Extrai mensagens recebidas e status de entrega de um payload de webhook. */
export function parseWhatsAppWebhook(payload: unknown): { inbound: WebhookInbound[]; statuses: WebhookStatus[] } {
  const inbound: WebhookInbound[] = [];
  const statuses: WebhookStatus[] = [];
  const entries = (payload as { entry?: unknown })?.entry;
  if (!Array.isArray(entries)) return { inbound, statuses };
  for (const entry of entries) {
    for (const change of asArray(entry?.changes)) {
      const value = (change?.value ?? {}) as { messages?: unknown; statuses?: unknown };
      for (const m of asArray(value.messages)) {
        inbound.push({ waId: String(m?.from ?? ''), text: m?.text?.body ?? null, timestamp: isoFromUnix(m?.timestamp) });
      }
      for (const s of asArray(value.statuses)) {
        statuses.push({ id: String(s?.id ?? ''), status: String(s?.status ?? ''), timestamp: isoFromUnix(s?.timestamp) });
      }
    }
  }
  return { inbound, statuses };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asArray(value: unknown): any[] { return Array.isArray(value) ? value : []; }
function isoFromUnix(ts: unknown): string {
  const n = Number(ts);
  return Number.isFinite(n) && n > 0 ? new Date(n * 1000).toISOString() : new Date().toISOString();
}

export class CloudWhatsAppService implements WhatsAppService {
  readonly mode = 'cloud' as const;
  private local: MockWhatsAppService;

  constructor(
    private repository: OperationalMemoryRepository,
    private config: WhatsAppCloudConfig,
    private fetchImpl: typeof fetch = fetch,
  ) {
    this.local = new MockWhatsAppService(repository);
  }

  locateContact(name: string) { return this.local.locateContact(name); }
  prepareMessage(contact: Contact | null, recipientName: string, body: string) { return this.local.prepareMessage(contact, recipientName, body); }
  getHistory(contactId: string) { return this.local.getHistory(contactId); }

  async sendMessage(messageId: string): Promise<Message> {
    const memory = this.repository.read();
    const message = memory.messages.find((m) => m.id === messageId);
    if (!message) throw new Error('Mensagem preparada não encontrada.');
    const contact = message.contactId ? memory.contacts.find((c) => c.id === message.contactId) || null : null;
    const gate = whatsappSendAllowed(message, contact);
    if (!gate.allowed) throw new Error(gate.reason);

    const version = this.config.graphVersion || GRAPH_VERSION;
    const url = `https://graph.facebook.com/${version}/${this.config.phoneNumberId}/messages`;
    let providerMessageId: string | null = null;
    try {
      const res = await this.fetchImpl(url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${this.config.accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(buildWhatsAppTextPayload(contact!.phone!, message.body)),
      });
      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        throw new Error(`WhatsApp Cloud API ${res.status}: ${errText.slice(0, 200)}`);
      }
      const json = await res.json().catch(() => ({} as Record<string, unknown>));
      providerMessageId = extractProviderMessageId(json);
    } catch (error) {
      this.markStatus(messageId, 'failed', null);
      throw error instanceof Error ? error : new Error('Falha ao enviar pelo WhatsApp.');
    }
    const sent = this.markStatus(messageId, 'sent', providerMessageId);
    if (!sent) throw new Error('Mensagem preparada não encontrada.');
    return sent;
  }

  async handleWebhook(payload: unknown) {
    const { inbound } = parseWhatsAppWebhook(payload);
    for (const msg of inbound) {
      const contact = this.repository.read().contacts.find((c) => c.phone && normalizePhone(c.phone) === normalizePhone(msg.waId));
      if (!contact) continue;
      this.repository.update((mem) => {
        const stored = mem.contacts.find((c) => c.id === contact.id);
        if (stored) { stored.lastInboundAt = msg.timestamp; stored.updatedAt = new Date().toISOString(); }
      });
    }
  }

  private markStatus(messageId: string, status: Message['status'], providerMessageId: string | null): Message | null {
    let result: Message | null = null;
    this.repository.update((mem) => {
      const m = mem.messages.find((x) => x.id === messageId);
      if (!m) return;
      m.status = status;
      if (providerMessageId) m.providerMessageId = providerMessageId;
      m.updatedAt = new Date().toISOString();
      result = m;
    });
    return result;
  }
}

function extractProviderMessageId(json: unknown): string | null {
  const messages = (json as { messages?: Array<{ id?: unknown }> })?.messages;
  const id = Array.isArray(messages) ? messages[0]?.id : undefined;
  return id ? String(id) : null;
}
