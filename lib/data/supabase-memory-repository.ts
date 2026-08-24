import type { SupabaseClient } from '@supabase/supabase-js';
import { emptyMemory } from '@/lib/assistant/memory';
import { recurrenceFromMeta } from '@/lib/assistant/recurrence';
import type {
  ActionLog, CalendarEvent, Contact, Expense, Message, Note, OperationalMemory,
  PendingQuestion, Reminder, Task,
} from '@/lib/assistant/types';
import type { ServerInterpretationResult } from '@/lib/assistant/ai-runtime';

type Entity = Contact | Expense | Task | Reminder | CalendarEvent | Note | Message | ActionLog;
type TableName = 'contacts' | 'expenses' | 'tasks' | 'reminders' | 'events' | 'notes' | 'messages' | 'action_logs';

export class SupabaseMemoryRepository {
  constructor(private client: SupabaseClient, private userId: string) {}

  async load(): Promise<OperationalMemory> {
    const [contacts, expenses, tasks, reminders, events, notes, messages, actionLogs, context] = await Promise.all([
      this.rows('contacts', 'created_at', 200),
      this.rows('expenses', 'occurred_at', 500),
      this.rows('tasks', 'created_at', 300),
      this.rows('reminders', 'due_at', 300),
      this.rows('events', 'starts_at', 300),
      this.rows('notes', 'created_at', 300),
      this.rows('messages', 'created_at', 300),
      this.rows('action_logs', 'created_at', 100),
      this.context(),
    ]);

    return {
      ...emptyMemory(),
      userId: this.userId,
      contacts: contacts.map(contactFromRow),
      expenses: expenses.map(expenseFromRow),
      tasks: tasks.map(taskFromRow),
      reminders: reminders.map(reminderFromRow),
      events: events.map(eventFromRow),
      notes: notes.map(noteFromRow),
      messages: messages.map(messageFromRow),
      actionLogs: actionLogs.map(actionLogFromRow),
      recentConversation: conversationFromJson(context?.recent_conversation),
      pendingQuestion: (context?.pending_question || null) as PendingQuestion | null,
      lastPreparedMessageId: stringOrNull(context?.last_prepared_message_id),
    };
  }

  async persist(before: OperationalMemory, after: OperationalMemory) {
    assertMemoryOwner(before, this.userId);
    assertMemoryOwner(after, this.userId);
    const collections: Array<[TableName, Entity[], Entity[], (item: never, userId: string) => Record<string, unknown>]> = [
      ['contacts', before.contacts, after.contacts, contactToRow as never],
      ['expenses', before.expenses, after.expenses, expenseToRow as never],
      ['tasks', before.tasks, after.tasks, taskToRow as never],
      ['reminders', before.reminders, after.reminders, reminderToRow as never],
      ['events', before.events, after.events, eventToRow as never],
      ['notes', before.notes, after.notes, noteToRow as never],
      ['messages', before.messages, after.messages, messageToRow as never],
      ['action_logs', before.actionLogs, after.actionLogs, actionLogToRow as never],
    ];

    const changes = collections.map(([table, previous, current, mapper]) => ({ table, mapper, ...diffRecords(previous, current) }));
    for (const { table, mapper, changed } of changes) {
      if (changed.length) {
        const { error } = await this.client.from(table).upsert(changed.map((item) => mapper(item as never, this.userId)), { onConflict: 'id' });
        if (error) throw databaseError('persist', table, error);
      }
    }
    // Salva o contexto antes das exclusões para soltar referências à última mensagem.
    await this.persistContext(after);
    for (const { table, removedIds } of [...changes].reverse()) {
      if (removedIds.length) {
        const { error } = await this.client.from(table).delete().eq('user_id', this.userId).in('id', removedIds);
        if (error) throw databaseError('delete', table, error);
      }
    }
  }

  async recordAiUsage(result: ServerInterpretationResult) {
    if (!result.observationId) return;
    const { error } = await this.client.from('ai_usage_logs').upsert({
      id: result.observationId,
      user_id: this.userId,
      action_id: result.action?.id || result.observationId,
      provider: result.provider,
      model: result.model,
      intent: result.action?.intent || null,
      latency_ms: result.latencyMs,
      result: result.action ? 'success' : 'empty',
      error_code: null,
      input_tokens: result.usage.inputTokens,
      output_tokens: result.usage.outputTokens,
      total_tokens: result.usage.totalTokens,
      cached_input_tokens: result.usage.cachedInputTokens,
      metadata: {},
    }, { onConflict: 'id' });
    if (error) throw databaseError('persist', 'ai_usage_logs', error);
  }

  private async rows(table: TableName, order: string, limit: number) {
    let query = this.client.from(table).select('*').eq('user_id', this.userId).order(order, { ascending: false }).limit(limit);
    if (table !== 'action_logs') query = query.is('deleted_at', null);
    const { data, error } = await query;
    if (error) throw databaseError('load', table, error);
    return (data || []) as Array<Record<string, unknown>>;
  }

  private async context() {
    const { data, error } = await this.client.from('assistant_context').select('*').eq('user_id', this.userId).maybeSingle();
    if (error) throw databaseError('load', 'assistant_context', error);
    return data as Record<string, unknown> | null;
  }

  private async persistContext(memory: OperationalMemory) {
    const activeLast = memory.actionLogs.find((log) => !log.undoneAt) || null;
    const lastPrepared = memory.messages.some((message) => message.id === memory.lastPreparedMessageId)
      ? memory.lastPreparedMessageId
      : null;
    const { error } = await this.client.from('assistant_context').upsert({
      user_id: this.userId,
      recent_conversation: memory.recentConversation.slice(-12),
      pending_question: memory.pendingQuestion,
      last_prepared_message_id: lastPrepared,
      last_entity_type: activeLast?.entityType || null,
      last_entity_id: activeLast?.entityId || null,
      last_action_log_id: activeLast?.id || null,
      metadata: {},
    }, { onConflict: 'user_id' });
    if (error) throw databaseError('persist', 'assistant_context', error);
  }
}

export function assertMemoryOwner(memory: OperationalMemory, userId: string) {
  if (memory.userId !== userId) throw new Error('Memória pertence a outro usuário.');
  const collections: Entity[][] = [memory.contacts, memory.expenses, memory.tasks, memory.reminders, memory.events, memory.notes, memory.messages, memory.actionLogs];
  if (collections.some((items) => items.some((item) => item.userId !== userId))) throw new Error('Registro pertence a outro usuário.');
}

export function diffRecords<T extends { id: string }>(before: T[], after: T[]) {
  const previous = new Map(before.map((item) => [item.id, JSON.stringify(item)]));
  const currentIds = new Set(after.map((item) => item.id));
  return {
    changed: after.filter((item) => previous.get(item.id) !== JSON.stringify(item)),
    removedIds: before.filter((item) => !currentIds.has(item.id)).map((item) => item.id),
  };
}

function contactToRow(item: Contact, userId: string) { return { id: item.id, user_id: userId, name: item.name, aliases: item.aliases, role: item.role, class_name: item.className, phone: item.phone, whatsapp_opt_in: item.whatsappOptIn, last_inbound_at: item.lastInboundAt, created_at: item.createdAt, updated_at: item.updatedAt, metadata: {} }; }
function expenseToRow(item: Expense, userId: string) { return { id: item.id, user_id: userId, amount: item.amount, currency: item.currency, category: item.category, occurred_at: item.occurredAt, source: item.source, created_at: item.createdAt, updated_at: item.updatedAt, metadata: {} }; }
function taskToRow(item: Task, userId: string) { return { id: item.id, user_id: userId, contact_id: item.contactId, title: item.title, status: item.status, due_at: item.dueAt, created_at: item.createdAt, updated_at: item.updatedAt, metadata: {} }; }
function reminderToRow(item: Reminder, userId: string) { return { id: item.id, user_id: userId, contact_id: item.contactId, title: item.title, due_at: item.dueAt, notification_status: item.notificationStatus, created_at: item.createdAt, updated_at: item.updatedAt, metadata: item.recurrence ? { recurrence: item.recurrence } : {} }; }
function eventToRow(item: CalendarEvent, userId: string) { return { id: item.id, user_id: userId, contact_id: item.contactId, title: item.title, starts_at: item.startsAt, ends_at: item.endsAt, created_at: item.createdAt, updated_at: item.updatedAt, metadata: {} }; }
function noteToRow(item: Note, userId: string) { return { id: item.id, user_id: userId, contact_id: item.contactId, content: item.content, created_at: item.createdAt, updated_at: item.updatedAt, metadata: {} }; }
function messageToRow(item: Message, userId: string) { return { id: item.id, user_id: userId, contact_id: item.contactId, channel: item.channel, recipient_name: item.recipientName, body: item.body, status: item.status, requires_template: item.requiresTemplate, provider_message_id: item.providerMessageId, created_at: item.createdAt, updated_at: item.updatedAt, metadata: {} }; }
function actionLogToRow(item: ActionLog, userId: string) { return { id: item.id, user_id: userId, intent: item.intent, entity_type: item.entityType, entity_id: item.entityId, status: item.undoneAt ? 'undone' : 'completed', summary: item.summary, source: item.source, reversible: item.reversible, before_data: item.before, after_data: item.after, undone_at: item.undoneAt, created_at: item.createdAt, updated_at: item.undoneAt || item.createdAt, metadata: {} }; }

function base(row: Record<string, unknown>) { return { id: String(row.id), userId: String(row.user_id), createdAt: String(row.created_at), updatedAt: String(row.updated_at) }; }
export function contactFromRow(row: Record<string, unknown>): Contact { return { ...base(row), name: String(row.name), aliases: Array.isArray(row.aliases) ? row.aliases.map(String) : [], role: stringOrNull(row.role), className: stringOrNull(row.class_name), phone: stringOrNull(row.phone), whatsappOptIn: Boolean(row.whatsapp_opt_in), lastInboundAt: stringOrNull(row.last_inbound_at) }; }
export function expenseFromRow(row: Record<string, unknown>): Expense { return { ...base(row), amount: Number(row.amount), currency: 'BRL', category: String(row.category), occurredAt: String(row.occurred_at), source: row.source === 'voice' ? 'voice' : 'text' }; }
export function taskFromRow(row: Record<string, unknown>): Task { return { ...base(row), title: String(row.title), status: row.status === 'done' ? 'done' : 'open', dueAt: stringOrNull(row.due_at), contactId: stringOrNull(row.contact_id) }; }
export function reminderFromRow(row: Record<string, unknown>): Reminder { return { ...base(row), title: String(row.title), dueAt: String(row.due_at), contactId: stringOrNull(row.contact_id), notificationStatus: row.notification_status === 'delivered' ? 'delivered' : 'pending', recurrence: recurrenceFromMeta(row.metadata) }; }
export function eventFromRow(row: Record<string, unknown>): CalendarEvent { return { ...base(row), title: String(row.title), startsAt: String(row.starts_at), endsAt: stringOrNull(row.ends_at), contactId: stringOrNull(row.contact_id) }; }
export function noteFromRow(row: Record<string, unknown>): Note { return { ...base(row), content: String(row.content), contactId: stringOrNull(row.contact_id) }; }
function messageFromRow(row: Record<string, unknown>): Message { const status = ['prepared', 'mock_sent', 'sent', 'failed'].includes(String(row.status)) ? row.status as Message['status'] : 'failed'; return { ...base(row), channel: 'whatsapp', contactId: stringOrNull(row.contact_id), recipientName: String(row.recipient_name), body: String(row.body), status, requiresTemplate: Boolean(row.requires_template), providerMessageId: stringOrNull(row.provider_message_id) }; }
function actionLogFromRow(row: Record<string, unknown>): ActionLog { return { id: String(row.id), userId: String(row.user_id), intent: String(row.intent) as ActionLog['intent'], entityType: stringOrNull(row.entity_type) as ActionLog['entityType'], entityId: stringOrNull(row.entity_id), summary: String(row.summary), createdAt: String(row.created_at), source: row.source === 'voice' ? 'voice' : 'text', reversible: Boolean(row.reversible), undoneAt: stringOrNull(row.undone_at), before: row.before_data ?? null, after: row.after_data ?? null }; }

function conversationFromJson(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.slice(-12).filter((turn): turn is Record<string, unknown> => Boolean(turn && typeof turn === 'object')).map((turn) => ({ id: String(turn.id), role: turn.role === 'assistant' ? 'assistant' as const : 'user' as const, text: String(turn.text), createdAt: String(turn.createdAt) }));
}
function stringOrNull(value: unknown) { return typeof value === 'string' && value.trim() ? value : null; }
function databaseError(operation: string, table: string, error: { code?: string; message?: string }) { const issue = error.code || 'database_error'; return new Error(`Falha de persistência (${operation}:${table}:${issue}).`); }
