import { requiresConfirmation } from './confirmation-policy';
import { executeAction } from './executor';
import { cleanContactDescription } from './interpreter';
import { OperationalMemoryRepository, makeId, normalize } from './memory';
import { combineDateTime, parseDate, parseTime } from './parsing';
import { MockWhatsAppService, type WhatsAppService } from './whatsapp-service';
import { LocalActionInterpreter } from './local-action-interpreter';
import { extractAmount } from './parsing';
import type { ActionInterpreter, AiProviderName, AssistantAction, EngineResult, PendingQuestion, Source } from './types';

export class ConversationEngine {
  private whatsapp: WhatsAppService;
  private currentProvider: AiProviderName | undefined;
  private providerNotice: string | undefined;
  constructor(private repository = new OperationalMemoryRepository(), whatsapp?: WhatsAppService, private interpreter: ActionInterpreter = new LocalActionInterpreter()) {
    this.whatsapp = whatsapp || new MockWhatsAppService(repository);
  }

  activities() { return this.repository.activities(); }

  async process(text: string, source: Source): Promise<EngineResult> {
    const input = text.trim();
    if (!input) return this.result('error', 'Diga ou escreva um comando.', null);
    const context = this.repository.read().recentConversation.map(({ role, text: turnText }) => ({ role, text: turnText }));
    this.repository.addTurn('user', input);
    const pending = this.repository.read().pendingQuestion;
    if (pending) return this.resume(pending, input, source);

    let action: AssistantAction | null;
    try {
      const interpreted = await this.interpreter.interpret(input, { turns: context, source });
      action = interpreted.action;
      this.currentProvider = interpreted.provider;
      this.providerNotice = interpreted.notice;
    } catch (error) {
      return this.say('error', error instanceof Error ? error.message : 'Não consegui acessar o cérebro da assistente.', null);
    }
    if (!action) return this.say('error', 'Ainda não entendi. Tente dizer “anota que…”, “me lembre…”, “quanto gastei…” ou “prepare uma mensagem…”.', null);
    return this.route(action, source);
  }

  async confirm(action?: AssistantAction, source: Source = 'text') {
    const stored = this.repository.read().pendingQuestion;
    const confirmed = action || (stored?.kind === 'confirmation' ? stored.action : null);
    if (!confirmed) return this.say('error', 'Não há nenhuma ação aguardando confirmação.', null);
    this.setPending(null);
    return this.run(confirmed, source);
  }

  cancelConfirmation() {
    this.setPending(null);
    return this.say('question', 'Tudo bem, não executei a ação.', null);
  }

  private async route(action: AssistantAction, source: Source): Promise<EngineResult> {
    if (action.intent === 'create_expense') {
      const amount = Number(action.data.amount);
      if (!Number.isFinite(amount) || amount <= 0) {
        this.setPending({ kind: 'expense_amount', action });
        return this.say('question', 'Qual foi o valor do gasto?', action);
      }
    }

    if (action.intent === 'create_reminder') {
      const title = String(action.data.title || '').trim();
      const dueAt = action.data.dueAt;
      if (!title) {
        this.setPending({ kind: 'reminder_title', dueAt: typeof dueAt === 'string' ? dueAt : '' });
        return this.say('question', 'Do que você quer que eu te lembre?', action);
      }
      if (!dueAt) {
        this.setPending({ kind: 'reminder_date', title, contactName: stringOrNull(action.data.contactName) });
        return this.say('question', 'Para quando devo criar esse lembrete?', action);
      }
      if (action.data.requiresMessageDetail) {
        this.setPending({ kind: 'reminder_message', title, dueAt: String(dueAt), contactName: stringOrNull(action.data.contactName) });
        return this.say('question', 'Que mensagem?', action);
      }
    }

    if (action.intent === 'create_note' && !String(action.data.content || '').trim()) {
      this.setPending({ kind: 'note_content' });
      return this.say('question', 'O que você quer que eu anote?', action);
    }

    if (action.intent === 'create_task' && !String(action.data.title || '').trim()) {
      this.setPending({ kind: 'task_title', dueAt: stringOrNull(action.data.dueAt), contactName: stringOrNull(action.data.contactName) });
      return this.say('question', 'Qual tarefa devo criar?', action);
    }

    if (action.intent === 'create_event') {
      const title = String(action.data.title || '').trim();
      if (!title) {
        this.setPending({ kind: 'event_title', startsAt: stringOrNull(action.data.startsAt) || '', contactName: stringOrNull(action.data.contactName) });
        return this.say('question', 'Qual evento você quer agendar?', action);
      }
      if (!action.data.startsAt) {
        this.setPending({ kind: 'event_date', title, contactName: stringOrNull(action.data.contactName) });
        return this.say('question', `Quando será ${title}?`, action);
      }
    }

    if (action.intent === 'prepare_whatsapp_message') {
      const recipient = String(action.data.recipientName || '').trim();
      const body = String(action.data.body || '').trim();
      if (!recipient) { this.setPending({ kind: 'message_recipient', body }); return this.say('question', 'Para quem devo preparar a mensagem?', action); }
      if (!body) { this.setPending({ kind: 'message_body', recipientName: recipient }); return this.say('question', `O que você quer dizer para ${recipient}?`, action); }
    }

    if (action.intent === 'send_whatsapp_message') {
      let messageId = stringOrNull(action.data.messageId);
      if (!messageId) {
        const memory = this.repository.read();
        if (action.data.recipientName && action.data.body) {
          const prepared = await this.prepareWithContact(action, source);
          if (prepared.kind !== 'executed') return prepared;
          messageId = this.repository.read().lastPreparedMessageId;
        } else {
          messageId = memory.lastPreparedMessageId;
        }
      }
      if (!messageId) return this.say('error', 'Não há uma mensagem preparada para enviar.', action);
      const message = this.repository.read().messages.find((item) => item.id === messageId);
      if (!message || message.status !== 'prepared') return this.say('error', 'A última mensagem já foi enviada ou não está mais disponível.', action);
      action.data.messageId = messageId;
      action.data.recipientName = message.recipientName;
      action.data.body = message.body;
    }

    if (needsContact(action)) {
      const contactResult = await this.resolveContact(action, source);
      if (contactResult) return contactResult;
    }

    if (requiresConfirmation(action, this.repository.read())) {
      this.setPending({ kind: 'confirmation', action });
      const recipient = String(action.data.recipientName || 'o contato');
      const body = String(action.data.body || '');
      return this.say('confirmation', `Vou enviar para ${recipient}: “${body}”. Confirmar?`, action);
    }
    return this.run(action, source);
  }

  private async prepareWithContact(sendAction: AssistantAction, source: Source) {
    const prepare: AssistantAction = {
      ...sendAction, id: makeId(), intent: 'prepare_whatsapp_message', requiresConfirmation: false,
      title: `Mensagem para ${sendAction.data.recipientName}`, data: { ...sendAction.data },
    };
    return this.route(prepare, source);
  }

  private async resolveContact(action: AssistantAction, source: Source): Promise<EngineResult | null> {
    const name = stringOrNull(action.data.contactName) || stringOrNull(action.data.recipientName);
    if (!name || action.data.contactId) return null;
    const contacts = await this.whatsapp.locateContact(name);
    if (contacts.length === 1) { action.data.contactId = contacts[0].id; action.data.recipientName = contacts[0].name; return null; }
    if (contacts.length > 1) {
      this.setPending({ kind: 'contact_choice', contactIds: contacts.map((contact) => contact.id), action });
      return this.say('question', `Encontrei ${contacts.length} pessoas chamadas ${name}. Qual delas? ${contacts.map((contact, index) => `${index + 1}, ${describeContact(contact)}`).join('; ')}.`, action);
    }
    this.setPending({ kind: 'contact_identity', contactName: name, action });
    return this.say('question', `Ainda não conheço ${name}. Quem é essa pessoa?`, action);
  }

  private async resume(pending: PendingQuestion, input: string, source: Source): Promise<EngineResult> {
    if (pending.kind === 'confirmation') {
      const answer = normalize(input).replace(/[.!?]+$/, '');
      if (/^(sim|certo|confirmo|pode|pode enviar|envie)$/i.test(answer)) return this.confirm(pending.action, source);
      if (/^(nao|cancela|cancelar)$/i.test(answer)) return this.cancelConfirmation();
      return this.say('confirmation', 'Preciso que você confirme ou cancele antes de continuar.', pending.action);
    }

    if (pending.kind === 'expense_amount') {
      const amount = extractAmount(input).amount;
      if (amount === null || amount <= 0) return this.say('question', 'Não consegui identificar o valor. Quanto você gastou?', pending.action);
      this.setPending(null);
      pending.action.data.amount = amount;
      return this.route(pending.action, source);
    }

    if (pending.kind === 'reminder_title') {
      this.setPending(null);
      const action: AssistantAction = { id: makeId(), intent: 'create_reminder', title: input, summary: '', requiresConfirmation: false, data: { title: input, dueAt: pending.dueAt || null, contactName: contactFromPhrase(input) } };
      return this.route(action, source);
    }

    if (pending.kind === 'reminder_message') {
      this.setPending(null);
      const detail = input.replace(/^(?:sobre|a respeito de)\s+/i, '').replace(/[.!?]+$/, '');
      const title = `${pending.title} sobre ${detail}`;
      const action: AssistantAction = { id: makeId(), intent: 'create_reminder', title, summary: '', requiresConfirmation: false, data: { title, dueAt: pending.dueAt, contactName: pending.contactName } };
      return this.route(action, source);
    }

    if (pending.kind === 'note_content') {
      this.setPending(null);
      return this.route({ id: makeId(), intent: 'create_note', title: input, summary: '', requiresConfirmation: false, data: { content: input, contactName: contactFromPhrase(input) } }, source);
    }

    if (pending.kind === 'task_title') {
      this.setPending(null);
      return this.route({ id: makeId(), intent: 'create_task', title: input, summary: '', requiresConfirmation: false, data: { title: input, dueAt: pending.dueAt, contactName: pending.contactName || contactFromPhrase(input) } }, source);
    }

    if (pending.kind === 'event_title') {
      this.setPending(null);
      return this.route({ id: makeId(), intent: 'create_event', title: input, summary: '', requiresConfirmation: false, data: { title: input, startsAt: pending.startsAt || null, contactName: pending.contactName || contactFromPhrase(input) } }, source);
    }

    if (pending.kind === 'reminder_date' || pending.kind === 'event_date') {
      const date = parseDate(input);
      if (!date) return this.say('question', 'Não consegui identificar a data. Pode dizer “hoje” ou “amanhã”?', null);
      this.setPending(null);
      const dateTime = combineDateTime(date, parseTime(input));
      const intent = pending.kind === 'reminder_date' ? 'create_reminder' : 'create_event';
      const data: AssistantAction['data'] = pending.kind === 'reminder_date'
        ? { title: pending.title, dueAt: dateTime, contactName: pending.contactName }
        : { title: pending.title, startsAt: dateTime, contactName: pending.contactName };
      return this.route({ id: makeId(), intent, title: pending.title, summary: '', requiresConfirmation: false, data }, source);
    }

    if (pending.kind === 'message_body') {
      this.setPending(null);
      return this.route({ id: makeId(), intent: 'prepare_whatsapp_message', title: `Mensagem para ${pending.recipientName}`, summary: '', requiresConfirmation: false, data: { recipientName: pending.recipientName, body: input } }, source);
    }

    if (pending.kind === 'message_recipient') {
      this.setPending(null);
      return this.route({ id: makeId(), intent: 'prepare_whatsapp_message', title: `Mensagem para ${input}`, summary: '', requiresConfirmation: false, data: { recipientName: input, body: pending.body } }, source);
    }

    if (pending.kind === 'contact_identity') {
      const contact = this.repository.createContact(pending.contactName, cleanContactDescription(input));
      this.setPending(null);
      pending.action.data.contactId = contact.id;
      if (pending.action.intent === 'prepare_whatsapp_message' || pending.action.intent === 'send_whatsapp_message') pending.action.data.recipientName = contact.name;
      return this.route(pending.action, source);
    }

    if (pending.kind === 'contact_choice') {
      const memory = this.repository.read();
      const options = memory.contacts.filter((contact) => pending.contactIds.includes(contact.id));
      const number = Number(input.trim());
      const chosen = Number.isInteger(number) && options[number - 1] ? options[number - 1] : options.filter((contact) => normalize(`${contact.name} ${contact.role || ''} ${contact.className || ''}`).includes(normalize(input)))[0];
      if (!chosen) return this.say('question', `Não consegui identificar. Diga o número ou a descrição: ${options.map((contact, index) => `${index + 1}, ${describeContact(contact)}`).join('; ')}.`, pending.action);
      this.setPending(null);
      pending.action.data.contactId = chosen.id;
      pending.action.data.recipientName = chosen.name;
      return this.route(pending.action, source);
    }

    return this.say('error', 'Não consegui continuar essa conversa.', null);
  }

  private async run(action: AssistantAction, source: Source) {
    try {
      const executed = await executeAction(action, source, this.repository, this.whatsapp);
      return this.say(isReadIntent(action.intent) ? 'query' : 'executed', executed.reply, action);
    } catch (error) {
      return this.say('error', error instanceof Error ? error.message : 'Não consegui executar essa ação.', action);
    }
  }

  private setPending(pending: PendingQuestion | null) { this.repository.update((memory) => { memory.pendingQuestion = pending; }); }
  private say(kind: EngineResult['kind'], reply: string, action: AssistantAction | null) { this.repository.addTurn('assistant', reply); return this.result(kind, reply, action); }
  private result(kind: EngineResult['kind'], reply: string, action: AssistantAction | null): EngineResult { return { kind, reply, action, activities: this.repository.activities(), provider: this.currentProvider, providerNotice: this.providerNotice }; }
}

function needsContact(action: AssistantAction) { return ['create_reminder', 'create_note', 'create_task', 'create_event', 'prepare_whatsapp_message'].includes(action.intent) && Boolean(action.data.contactName || action.data.recipientName); }
function isReadIntent(intent: string) { return intent.startsWith('read_') || intent.startsWith('search_'); }
function stringOrNull(value: unknown) { return typeof value === 'string' && value.trim() ? value.trim() : null; }
function contactFromPhrase(value: string) { return value.match(/(?:com|para)\s+([\p{L}'-]+)/iu)?.[1] || null; }
function describeContact(contact: { name: string; role: string | null; className: string | null }) { return `${contact.name}${contact.role ? `, ${contact.role}` : ''}${contact.className ? ` de ${contact.className}` : ''}`; }
