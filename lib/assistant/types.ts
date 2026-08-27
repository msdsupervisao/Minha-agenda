export type Intent =
  | 'create_expense'
  | 'create_reminder'
  | 'create_note'
  | 'create_task'
  | 'create_event'
  | 'read_expenses'
  | 'read_tasks'
  | 'read_reminders'
  | 'read_events'
  | 'search_memory'
  | 'search_contact'
  | 'prepare_whatsapp_message'
  | 'send_whatsapp_message'
  | 'schedule_whatsapp_message'
  | 'undo_last_action'
  | 'correct_last_expense';

export type EntityType = 'contact' | 'expense' | 'task' | 'reminder' | 'event' | 'note' | 'message';
export type Source = 'voice' | 'text';
export type Recurrence = 'daily' | 'weekly' | 'monthly';
export type DateRange = 'today' | 'tomorrow' | 'week' | 'next_week' | 'month' | 'next_month' | 'all';
export type AiProviderName = 'openai' | 'local';

export type AssistantAction = {
  id: string;
  intent: Intent;
  title: string;
  summary: string;
  requiresConfirmation: boolean;
  data: Record<string, string | number | boolean | null | string[]>;
  confidence?: number;
  interpretedBy?: AiProviderName;
};

type BaseEntity = { id: string; userId: string; createdAt: string; updatedAt: string };

export type Contact = BaseEntity & {
  name: string;
  aliases: string[];
  role: string | null;
  className: string | null;
  phone: string | null;
  whatsappOptIn: boolean;
  lastInboundAt: string | null;
};

export type Expense = BaseEntity & {
  amount: number;
  currency: 'BRL';
  category: string;
  occurredAt: string;
  source: Source;
};

export type Task = BaseEntity & {
  title: string;
  status: 'open' | 'done';
  dueAt: string | null;
  contactId: string | null;
};

export type Reminder = BaseEntity & {
  title: string;
  dueAt: string;
  contactId: string | null;
  notificationStatus: 'pending' | 'delivered';
  recurrence?: Recurrence | null;
};

export type CalendarEvent = BaseEntity & {
  title: string;
  startsAt: string;
  endsAt: string | null;
  contactId: string | null;
};

export type Note = BaseEntity & { content: string; contactId: string | null };

export type SchoolClass = BaseEntity & {
  name: string;
  course: string | null;
  schedule: string | null;
  teacher: string | null;
  notes: string | null;
  whatsappGroup: string | null;
  noticeTemplateDirect: string | null;
  noticeTemplateMotivational: string | null;
  noticeTemplateImpactful: string | null;
};

export type Message = BaseEntity & {
  channel: 'whatsapp';
  contactId: string | null;
  recipientName: string;
  body: string;
  status: 'prepared' | 'mock_sent' | 'sent' | 'failed';
  requiresTemplate: boolean;
  providerMessageId: string | null;
};

export type ActionLog = {
  id: string;
  userId: string;
  intent: Intent;
  entityType: EntityType | null;
  entityId: string | null;
  summary: string;
  status: 'pending' | 'completed' | 'failed' | 'unknown' | 'undone';
  createdAt: string;
  source: Source;
  reversible: boolean;
  undoneAt: string | null;
  before: unknown;
  after: unknown;
};

export type ConversationTurn = { id: string; role: 'user' | 'assistant'; text: string; createdAt: string };

export type PendingQuestion =
  | { kind: 'expense_amount'; action: AssistantAction }
  | { kind: 'reminder_title'; dueAt: string }
  | { kind: 'reminder_message'; title: string; dueAt: string; contactName: string | null }
  | { kind: 'reminder_date'; title: string; contactName: string | null }
  | { kind: 'event_date'; title: string; contactName: string | null }
  | { kind: 'event_title'; startsAt: string; contactName: string | null }
  | { kind: 'note_content' }
  | { kind: 'task_title'; dueAt: string | null; contactName: string | null }
  | { kind: 'message_body'; recipientName: string }
  | { kind: 'message_recipient'; body: string }
  | { kind: 'scheduled_message_body'; recipientName: string; dueAt: string | null }
  | { kind: 'scheduled_message_recipient'; body: string; dueAt: string | null }
  | { kind: 'scheduled_message_date'; recipientName: string; body: string }
  | { kind: 'contact_identity'; contactName: string; action: AssistantAction }
  | { kind: 'contact_choice'; contactIds: string[]; action: AssistantAction }
  | { kind: 'confirmation'; action: AssistantAction };

export type OperationalMemory = {
  version: 3;
  userId: string;
  contacts: Contact[];
  expenses: Expense[];
  tasks: Task[];
  reminders: Reminder[];
  events: CalendarEvent[];
  notes: Note[];
  messages: Message[];
  actionLogs: ActionLog[];
  recentConversation: ConversationTurn[];
  pendingQuestion: PendingQuestion | null;
  lastPreparedMessageId: string | null;
};

export type AssistantState = 'idle' | 'listening' | 'processing' | 'action' | 'success' | 'confirmation' | 'error';

export type ActivityItem = {
  id: string;
  intent: Intent;
  title: string;
  createdAt: string;
  status: string;
};

export type EngineResult = {
  kind: 'executed' | 'query' | 'question' | 'confirmation' | 'error';
  reply: string;
  action: AssistantAction | null;
  activities: ActivityItem[];
  whatsappHandoff?: import('./whatsapp-handoff').WhatsAppHandoff;
  scheduleHandoff?: import('./whatsapp-handoff').WhatsAppHandoff & { dueAt: string; actionLogId: string };
  weeklyNotice?: import('../notices/weekly').ResolvedWeeklyNotice;
  provider?: AiProviderName;
  providerNotice?: string;
};

export type InterpretationResult = {
  action: AssistantAction | null;
  provider: AiProviderName;
  notice: string;
  observationId?: string;
};

export type InterpretationContext = {
  turns: Array<{ role: 'user' | 'assistant'; text: string }>;
  source: Source;
};

export type ActionInterpreter = {
  interpret(text: string, context: InterpretationContext): Promise<InterpretationResult>;
};
