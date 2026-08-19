import { OperationalMemoryRepository, makeId, normalize, rangeBounds } from './memory';
import { MockWhatsAppService, type WhatsAppService } from './whatsapp-service';
import type { AssistantAction, CalendarEvent, Expense, Note, Reminder, Source, Task } from './types';

export type ExecutionResult = { reply: string; entityId: string | null };

export async function executeAction(
  action: AssistantAction,
  source: Source,
  repository = new OperationalMemoryRepository(),
  whatsapp: WhatsAppService = new MockWhatsAppService(repository),
): Promise<ExecutionResult> {
  const memory = repository.read();
  const now = new Date().toISOString();

  if (action.intent === 'create_expense') {
    const expense: Expense = { id: makeId(), userId: memory.userId, createdAt: now, updatedAt: now, amount: Number(action.data.amount), currency: 'BRL', category: String(action.data.category), occurredAt: String(action.data.occurredAt || now), source };
    repository.update((state) => state.expenses.unshift(expense));
    repository.log({ intent: action.intent, entityType: 'expense', entityId: expense.id, summary: `${money(expense.amount)} · ${expense.category}`, source, reversible: true, before: null, after: expense });
    return { reply: `Anotei ${money(expense.amount)} de ${expense.category}.`, entityId: expense.id };
  }

  if (action.intent === 'create_reminder') {
    const reminder: Reminder = { id: makeId(), userId: memory.userId, createdAt: now, updatedAt: now, title: String(action.data.title), dueAt: String(action.data.dueAt), contactId: stringOrNull(action.data.contactId), notificationStatus: 'pending' };
    repository.update((state) => state.reminders.unshift(reminder));
    repository.log({ intent: action.intent, entityType: 'reminder', entityId: reminder.id, summary: reminder.title, source, reversible: true, before: null, after: reminder });
    return { reply: `Pronto. Vou te lembrar ${friendlyDate(reminder.dueAt)} de ${lowerFirst(reminder.title)}.`, entityId: reminder.id };
  }

  if (action.intent === 'create_note') {
    const note: Note = { id: makeId(), userId: memory.userId, createdAt: now, updatedAt: now, content: String(action.data.content), contactId: stringOrNull(action.data.contactId) };
    repository.update((state) => state.notes.unshift(note));
    repository.log({ intent: action.intent, entityType: 'note', entityId: note.id, summary: note.content, source, reversible: true, before: null, after: note });
    return { reply: 'Anotado.', entityId: note.id };
  }

  if (action.intent === 'create_task') {
    const task: Task = { id: makeId(), userId: memory.userId, createdAt: now, updatedAt: now, title: String(action.data.title), status: 'open', dueAt: stringOrNull(action.data.dueAt), contactId: stringOrNull(action.data.contactId) };
    repository.update((state) => state.tasks.unshift(task));
    repository.log({ intent: action.intent, entityType: 'task', entityId: task.id, summary: task.title, source, reversible: true, before: null, after: task });
    return { reply: `Criei a tarefa: ${task.title}.`, entityId: task.id };
  }

  if (action.intent === 'create_event') {
    const event: CalendarEvent = { id: makeId(), userId: memory.userId, createdAt: now, updatedAt: now, title: String(action.data.title), startsAt: String(action.data.startsAt), endsAt: null, contactId: stringOrNull(action.data.contactId) };
    repository.update((state) => state.events.unshift(event));
    repository.log({ intent: action.intent, entityType: 'event', entityId: event.id, summary: event.title, source, reversible: true, before: null, after: event });
    return { reply: `Agendei ${event.title} para ${friendlyDate(event.startsAt)}.`, entityId: event.id };
  }

  if (action.intent === 'read_expenses') {
    const range = String(action.data.range || 'all') as import('./types').DateRange;
    const category = stringOrNull(action.data.category);
    const bounds = rangeBounds(range);
    const expenses = memory.expenses.filter((expense) => inRange(expense.occurredAt, bounds) && (!category || normalize(expense.category).includes(normalize(category))));
    const total = expenses.reduce((sum, expense) => sum + expense.amount, 0);
    if (!expenses.length) return { reply: `Não encontrei gastos${category ? ` com ${category}` : ''} nesse período.`, entityId: null };
    return { reply: `Você gastou ${money(total)}${category ? ` com ${category}` : ''} ${rangeLabel(range)}.`, entityId: null };
  }

  if (action.intent === 'read_tasks') {
    const overdue = action.data.status === 'overdue';
    const range = String(action.data.range || 'all') as import('./types').DateRange;
    const bounds = rangeBounds(range);
    const tasks = memory.tasks.filter((task) => task.status === 'open' && (!overdue || Boolean(task.dueAt && new Date(task.dueAt) < new Date())) && (overdue || range === 'all' || Boolean(task.dueAt && inRange(task.dueAt, bounds))));
    return { reply: tasks.length ? `${overdue ? 'Tarefas atrasadas' : 'Tarefas abertas'}: ${tasks.map((task) => task.title).join('; ')}.` : `Você não tem tarefas ${overdue ? 'atrasadas' : 'abertas'}.`, entityId: null };
  }

  if (action.intent === 'read_reminders') {
    const range = String(action.data.range || 'all') as import('./types').DateRange;
    const bounds = rangeBounds(range);
    const reminders = memory.reminders.filter((reminder) => inRange(reminder.dueAt, bounds));
    return { reply: reminders.length ? `Seus lembretes ${rangeLabel(range)}: ${reminders.map((item) => item.title).join('; ')}.` : `Você não tem lembretes ${rangeLabel(range)}.`, entityId: null };
  }

  if (action.intent === 'read_events') {
    const range = String(action.data.range || 'all') as import('./types').DateRange;
    if (action.data.next) {
      const next = [...memory.events].filter((event) => new Date(event.startsAt) >= new Date()).sort((a, b) => a.startsAt.localeCompare(b.startsAt))[0];
      return { reply: next ? `Seu próximo compromisso é ${next.title}, ${friendlyDate(next.startsAt)}.` : 'Você não tem próximos compromissos.', entityId: next?.id || null };
    }
    const bounds = rangeBounds(range);
    const items = [
      ...memory.events.filter((item) => inRange(item.startsAt, bounds)).map((item) => item.title),
      ...memory.reminders.filter((item) => inRange(item.dueAt, bounds)).map((item) => `lembrete: ${item.title}`),
      ...memory.tasks.filter((item) => item.dueAt && inRange(item.dueAt, bounds) && item.status === 'open').map((item) => `tarefa: ${item.title}`),
    ];
    return { reply: items.length ? `Você tem ${items.join('; ')} ${rangeLabel(range)}.` : `Você não tem nada marcado ${rangeLabel(range)}.`, entityId: null };
  }

  if (action.intent === 'search_contact') {
    const contacts = repository.findContacts(String(action.data.name));
    if (!contacts.length) return { reply: `Ainda não conheço ${action.data.name}.`, entityId: null };
    if (contacts.length > 1) return { reply: `Encontrei ${contacts.length} pessoas com esse nome: ${contacts.map(describeContact).join('; ')}.`, entityId: null };
    return { reply: `${contacts[0].name}${contacts[0].role ? ` é ${contacts[0].role}` : ''}${contacts[0].className ? ` de ${contacts[0].className}` : ''}.`, entityId: contacts[0].id };
  }

  if (action.intent === 'search_memory') {
    if (action.data.query === 'awaiting_reply') {
      const waiting = memory.messages.filter((message) => message.status === 'sent' || message.status === 'mock_sent');
      return { reply: waiting.length ? `Você está esperando resposta de ${[...new Set(waiting.map((message) => message.recipientName))].join(', ')}.` : 'Não encontrei nenhuma resposta pendente.', entityId: null };
    }
    const query = normalize(String(action.data.query || ''));
    const hits = [...memory.notes.map((item) => item.content), ...memory.tasks.map((item) => item.title), ...memory.reminders.map((item) => item.title)].filter((value) => normalize(value).includes(query));
    return { reply: hits.length ? `Encontrei: ${hits.slice(0, 5).join('; ')}.` : 'Não encontrei isso na sua memória.', entityId: null };
  }

  if (action.intent === 'prepare_whatsapp_message') {
    const contactId = stringOrNull(action.data.contactId);
    const contact = memory.contacts.find((item) => item.id === contactId) || null;
    const message = await whatsapp.prepareMessage(contact, String(action.data.recipientName), String(action.data.body));
    repository.log({ intent: action.intent, entityType: 'message', entityId: message.id, summary: `Mensagem para ${message.recipientName}`, source, reversible: true, before: null, after: message });
    return { reply: `Preparei para ${message.recipientName}: “${message.body}”.`, entityId: message.id };
  }

  if (action.intent === 'send_whatsapp_message') {
    const message = await whatsapp.sendMessage(String(action.data.messageId));
    repository.log({ intent: action.intent, entityType: 'message', entityId: message.id, summary: `Envio mock para ${message.recipientName}`, source, reversible: false, before: { ...message, status: 'prepared' }, after: message });
    return { reply: `Enviei para ${message.recipientName} no modo de teste. Nenhuma mensagem real saiu do aplicativo.`, entityId: message.id };
  }

  if (action.intent === 'correct_last_expense') {
    const current = memory.expenses[0];
    if (!current) return { reply: 'Não encontrei um gasto recente para corrigir.', entityId: null };
    const before = { ...current };
    const nextAmount = Number(action.data.amount);
    repository.update((state) => {
      const expense = state.expenses.find((item) => item.id === current.id);
      if (expense) { expense.amount = nextAmount; expense.updatedAt = now; }
    });
    const after = { ...current, amount: nextAmount, updatedAt: now };
    repository.log({ intent: action.intent, entityType: 'expense', entityId: current.id, summary: `Gasto corrigido para ${money(nextAmount)}`, source, reversible: true, before, after });
    return { reply: `Corrigi o gasto de ${money(before.amount)} para ${money(nextAmount)}.`, entityId: current.id };
  }

  if (action.intent === 'undo_last_action') {
    const undone = repository.undoLast(source);
    return { reply: undone ? `Desfeito: ${undone.summary}.` : 'Não há uma ação recente que eu possa desfazer.', entityId: undone?.entityId || null };
  }

  return { reply: 'Essa ação ainda não está disponível.', entityId: null };
}

function stringOrNull(value: unknown) { return typeof value === 'string' && value ? value : null; }
function money(value: number) { return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value); }
function inRange(value: string, bounds: { start: Date; end: Date }) { const date = new Date(value); return date >= bounds.start && date <= bounds.end; }
function rangeLabel(range: string) { return ({ today: 'hoje', tomorrow: 'amanhã', week: 'nesta semana', next_week: 'na semana que vem', month: 'neste mês', next_month: 'no mês que vem', all: 'no total' } as Record<string, string>)[range] || 'no período'; }
function friendlyDate(value: string) { return new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', hour: new Date(value).getHours() ? '2-digit' : undefined, minute: new Date(value).getHours() ? '2-digit' : undefined }).format(new Date(value)); }
function lowerFirst(value: string) { return value.charAt(0).toLocaleLowerCase('pt-BR') + value.slice(1); }
function describeContact(contact: { name: string; role: string | null; className: string | null }) { return `${contact.name}${contact.role ? `, ${contact.role}` : ''}${contact.className ? ` de ${contact.className}` : ''}`; }
