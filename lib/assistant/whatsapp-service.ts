import { makeId, normalize, OperationalMemoryRepository } from './memory';
import type { Contact, Message } from './types';

export type WhatsAppService = {
  mode: 'mock' | 'cloud';
  locateContact(name: string): Promise<Contact[]>;
  prepareMessage(contact: Contact | null, recipientName: string, body: string): Promise<Message>;
  sendMessage(messageId: string): Promise<Message>;
  handleWebhook(payload: unknown): Promise<void>;
  getHistory(contactId: string): Promise<Message[]>;
};

export class MockWhatsAppService implements WhatsAppService {
  readonly mode = 'mock' as const;
  constructor(private repository: OperationalMemoryRepository) {}

  async locateContact(name: string) { return this.repository.findContacts(name); }

  async prepareMessage(contact: Contact | null, recipientName: string, body: string) {
    const now = new Date().toISOString();
    const message: Message = {
      id: makeId(), userId: this.repository.read().userId, createdAt: now, updatedAt: now,
      channel: 'whatsapp', contactId: contact?.id || null, recipientName: contact?.name || recipientName,
      body, status: 'prepared', requiresTemplate: !contact?.lastInboundAt || Date.now() - new Date(contact.lastInboundAt).getTime() > 24 * 60 * 60 * 1000,
      providerMessageId: null,
    };
    this.repository.update((memory) => { memory.messages.unshift(message); memory.lastPreparedMessageId = message.id; });
    return message;
  }

  async sendMessage(messageId: string) {
    let result: Message | null = null;
    this.repository.update((memory) => {
      const message = memory.messages.find((item) => item.id === messageId);
      if (!message) return;
      message.status = 'mock_sent';
      message.updatedAt = new Date().toISOString();
      message.providerMessageId = `mock-${makeId()}`;
      result = message;
    });
    if (!result) throw new Error('Mensagem preparada não encontrada.');
    return result;
  }

  async handleWebhook(payload: unknown) {
    if (!payload || typeof payload !== 'object') return;
    const data = payload as { contactName?: string; body?: string; receivedAt?: string };
    if (!data.contactName || !data.body) return;
    const contact = this.repository.findContacts(data.contactName)[0];
    if (!contact) return;
    this.repository.update((memory) => {
      const stored = memory.contacts.find((item) => item.id === contact.id);
      if (stored) { stored.lastInboundAt = data.receivedAt || new Date().toISOString(); stored.updatedAt = new Date().toISOString(); }
    });
  }

  async getHistory(contactId: string) {
    return this.repository.read().messages.filter((message) => message.contactId === contactId);
  }
}

export function describeWhatsAppConstraint(message: Message, contact: Contact | null) {
  if (!contact?.phone) return 'O contato ainda não possui telefone cadastrado; o envio continuará em modo de teste.';
  if (!contact.whatsappOptIn) return 'O contato ainda não possui opt-in registrado; a Cloud API não deve enviar esta mensagem.';
  if (message.requiresTemplate) return 'Fora da janela de 24 horas, a Cloud API exigirá um template aprovado.';
  return 'Mensagem livre permitida dentro da janela de atendimento, após a configuração da Cloud API.';
}

export function contactMatches(contact: Contact, value: string) {
  const query = normalize(value);
  return normalize(contact.name) === query || contact.aliases.some((alias) => normalize(alias) === query);
}
