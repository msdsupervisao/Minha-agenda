import { z } from 'zod';
import { makeId } from './memory';
import type { AiProviderName, AssistantAction, Intent } from './types';

export const intentValues = [
  'create_expense', 'create_reminder', 'create_note', 'create_task', 'create_event',
  'read_expenses', 'read_tasks', 'read_reminders', 'read_events', 'search_memory', 'search_contact',
  'prepare_whatsapp_message', 'send_whatsapp_message', 'schedule_whatsapp_message', 'undo_last_action', 'correct_last_expense',
] as const satisfies readonly Intent[];

const rangeValues = ['today', 'tomorrow', 'week', 'next_week', 'month', 'next_month', 'all'] as const;
const missingFieldValues = ['intent', 'amount', 'category', 'title', 'content', 'date', 'time', 'contact', 'recipient', 'message'] as const;

export const AiEntitiesSchema = z.object({
  amount: z.number().finite().nullable(),
  currency: z.enum(['BRL']).nullable(),
  category: z.string().max(120).nullable(),
  occurred_at: z.string().max(80).nullable(),
  title: z.string().max(500).nullable(),
  content: z.string().max(2000).nullable(),
  due_at: z.string().max(80).nullable(),
  recurrence: z.enum(['daily', 'weekly', 'monthly']).nullable(),
  starts_at: z.string().max(80).nullable(),
  range: z.enum(rangeValues).nullable(),
  status: z.enum(['open', 'done', 'overdue']).nullable(),
  query: z.string().max(500).nullable(),
  contact_name: z.string().max(160).nullable(),
  recipient_name: z.string().max(160).nullable(),
  body: z.string().max(2000).nullable(),
  message_id: z.string().max(160).nullable(),
  next: z.boolean(),
  requires_message_detail: z.boolean(),
  correction_amount: z.number().finite().nullable(),
}).strict();

export const AiStructuredInterpretationSchema = z.object({
  intent: z.enum(intentValues).nullable(),
  confidence: z.number().min(0).max(1),
  requires_confirmation: z.boolean(),
  language: z.literal('pt-BR'),
  entities: AiEntitiesSchema,
  missing_fields: z.array(z.enum(missingFieldValues)).max(10),
}).strict().superRefine((value, context) => {
  if (value.entities.amount !== null && value.entities.amount <= 0) {
    context.addIssue({ code: 'custom', path: ['entities', 'amount'], message: 'O valor deve ser maior que zero.' });
  }
  if (value.entities.correction_amount !== null && value.entities.correction_amount <= 0) {
    context.addIssue({ code: 'custom', path: ['entities', 'correction_amount'], message: 'O valor corrigido deve ser maior que zero.' });
  }
  for (const key of ['occurred_at', 'due_at', 'starts_at'] as const) {
    const date = value.entities[key];
    if (date !== null && Number.isNaN(Date.parse(date))) {
      context.addIssue({ code: 'custom', path: ['entities', key], message: 'A data deve ser ISO 8601 válida.' });
    }
  }
});

export type AiStructuredInterpretation = z.infer<typeof AiStructuredInterpretationSchema>;

export function validateStructuredInterpretation(value: unknown) {
  return AiStructuredInterpretationSchema.parse(value);
}

export function actionFromStructured(value: AiStructuredInterpretation, provider: AiProviderName): AssistantAction | null {
  if (!value.intent) return null;
  const e = value.entities;
  const common = {
    id: makeId(), intent: value.intent, summary: '', requiresConfirmation: false,
    confidence: value.confidence, interpretedBy: provider,
  };
  switch (value.intent) {
    case 'create_expense': return { ...common, title: `Gasto em ${e.category || 'geral'}`, data: { amount: e.amount, currency: e.currency || 'BRL', category: e.category || 'geral', occurredAt: e.occurred_at } };
    case 'create_reminder': return { ...common, title: e.title || 'Lembrete', data: { title: e.title, dueAt: e.due_at, contactName: e.contact_name, requiresMessageDetail: e.requires_message_detail, recurrence: e.recurrence } };
    case 'create_note': return { ...common, title: e.content || 'Anotação', data: { content: e.content, contactName: e.contact_name } };
    case 'create_task': return { ...common, title: e.title || 'Tarefa', data: { title: e.title, dueAt: e.due_at, contactName: e.contact_name } };
    case 'create_event': return { ...common, title: e.title || 'Evento', data: { title: e.title, startsAt: e.starts_at, contactName: e.contact_name } };
    case 'read_expenses': return { ...common, title: 'Consultar gastos', data: { range: e.range || 'all', category: e.category } };
    case 'read_tasks': return { ...common, title: 'Consultar tarefas', data: { range: e.range || 'all', status: e.status || 'open' } };
    case 'read_reminders': return { ...common, title: 'Consultar lembretes', data: { range: e.range || 'all' } };
    case 'read_events': return { ...common, title: 'Consultar agenda', data: { range: e.range || 'all', next: e.next } };
    case 'search_memory': return { ...common, title: 'Pesquisar memória', data: { query: e.query } };
    case 'search_contact': return { ...common, title: 'Localizar pessoa', data: { name: e.contact_name || e.query } };
    case 'prepare_whatsapp_message': return { ...common, title: `Mensagem para ${e.recipient_name || 'contato'}`, data: { recipientName: e.recipient_name, body: e.body } };
    case 'send_whatsapp_message': return { ...common, title: `Enviar mensagem${e.recipient_name ? ` para ${e.recipient_name}` : ''}`, data: { recipientName: e.recipient_name, body: e.body, messageId: e.message_id } };
    case 'schedule_whatsapp_message': return { ...common, title: `Agendar mensagem${e.recipient_name ? ` para ${e.recipient_name}` : ''}`, data: { recipientName: e.recipient_name, body: e.body, dueAt: e.due_at, messageId: e.message_id } };
    case 'undo_last_action': return { ...common, title: 'Desfazer', data: {} };
    case 'correct_last_expense': return { ...common, title: 'Corrigir gasto', data: { amount: e.correction_amount ?? e.amount } };
  }
}

export function structuredFromAction(action: AssistantAction | null): AiStructuredInterpretation {
  const data = action?.data || {};
  const value: AiStructuredInterpretation = {
    intent: action?.intent || null,
    confidence: action ? 1 : 0,
    requires_confirmation: false,
    language: 'pt-BR',
    entities: {
      amount: numberOrNull(data.amount), currency: data.currency === 'BRL' ? 'BRL' : null,
      category: stringOrNull(data.category), occurred_at: stringOrNull(data.occurredAt),
      title: stringOrNull(data.title), content: stringOrNull(data.content),
      due_at: stringOrNull(data.dueAt), recurrence: isRecurrence(data.recurrence) ? data.recurrence : null, starts_at: stringOrNull(data.startsAt),
      range: isRange(data.range) ? data.range : null,
      status: data.status === 'open' || data.status === 'done' || data.status === 'overdue' ? data.status : null,
      query: stringOrNull(data.query), contact_name: stringOrNull(data.contactName) || stringOrNull(data.name),
      recipient_name: stringOrNull(data.recipientName), body: stringOrNull(data.body), message_id: stringOrNull(data.messageId),
      next: data.next === true, requires_message_detail: data.requiresMessageDetail === true,
      correction_amount: action?.intent === 'correct_last_expense' ? numberOrNull(data.amount) : null,
    },
    missing_fields: [],
  };
  return validateStructuredInterpretation(value);
}

function stringOrNull(value: unknown) { return typeof value === 'string' && value.trim() ? value.trim() : null; }
function numberOrNull(value: unknown) { return typeof value === 'number' && Number.isFinite(value) ? value : null; }
function isRange(value: unknown): value is AiStructuredInterpretation['entities']['range'] { return typeof value === 'string' && (rangeValues as readonly string[]).includes(value); }
function isRecurrence(value: unknown): value is 'daily' | 'weekly' | 'monthly' { return value === 'daily' || value === 'weekly' || value === 'monthly'; }
