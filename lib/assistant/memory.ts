import type { ActionLog, ActivityItem, Contact, ConversationTurn, EntityType, Intent, OperationalMemory, Source } from './types';

export type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

const memoryKey = 'minha-agenda-operational-memory-v3';
const localUserId = 'local-user';

export function makeId() {
  return globalThis.crypto?.randomUUID?.() || `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function emptyMemory(): OperationalMemory {
  return {
    version: 3,
    userId: localUserId,
    contacts: [],
    expenses: [],
    tasks: [],
    reminders: [],
    events: [],
    notes: [],
    messages: [],
    actionLogs: [],
    recentConversation: [],
    pendingQuestion: null,
    lastPreparedMessageId: null,
  };
}

export function browserStorage(): StorageLike | null {
  return typeof window === 'undefined' ? null : window.localStorage;
}

export class OperationalMemoryRepository {
  constructor(private storage: StorageLike | null = browserStorage()) {}

  read(): OperationalMemory {
    if (!this.storage) return emptyMemory();
    try {
      const parsed = JSON.parse(this.storage.getItem(memoryKey) || 'null') as OperationalMemory | null;
      return parsed?.version === 3 ? parsed : emptyMemory();
    } catch {
      return emptyMemory();
    }
  }

  write(memory: OperationalMemory) {
    this.storage?.setItem(memoryKey, JSON.stringify(memory));
  }

  update(change: (memory: OperationalMemory) => void) {
    const memory = this.read();
    change(memory);
    memory.actionLogs = memory.actionLogs.slice(0, 100);
    memory.recentConversation = memory.recentConversation.slice(-12);
    this.write(memory);
    return memory;
  }

  addTurn(role: ConversationTurn['role'], text: string) {
    return this.update((memory) => {
      memory.recentConversation.push({ id: makeId(), role, text, createdAt: new Date().toISOString() });
    });
  }

  findContacts(name: string) {
    const query = normalize(name);
    return this.read().contacts.filter((contact) => {
      const candidates = [contact.name, ...contact.aliases].map(normalize);
      return candidates.some((candidate) => candidate === query || candidate.includes(query) || query.includes(candidate));
    });
  }

  createContact(name: string, description: string): Contact {
    const memory = this.read();
    const now = new Date().toISOString();
    const role = /professor/i.test(description) ? 'professor' : /alun[oa]/i.test(description) ? 'aluno' : description.trim() || null;
    const classMatch = description.match(/(?:turma|curso|professor(?:a)?\s+de)\s+(.+)/i);
    const contact: Contact = {
      id: makeId(), userId: memory.userId, createdAt: now, updatedAt: now,
      name: titleCase(name), aliases: [], role, className: classMatch?.[1]?.trim() || null,
      phone: null, whatsappOptIn: false, lastInboundAt: null,
    };
    this.update((memory) => { memory.contacts.unshift(contact); });
    return contact;
  }

  log(input: Omit<ActionLog, 'id' | 'userId' | 'createdAt' | 'undoneAt'>) {
    const memory = this.read();
    const log: ActionLog = { ...input, id: makeId(), userId: memory.userId, createdAt: new Date().toISOString(), undoneAt: null };
    this.update((memory) => { memory.actionLogs.unshift(log); });
    return log;
  }

  activities(): ActivityItem[] {
    return this.read().actionLogs.filter((log) => !log.undoneAt).slice(0, 5).map((log) => ({
      id: log.id,
      intent: log.intent,
      title: log.summary,
      createdAt: log.createdAt,
      status: log.intent === 'prepare_whatsapp_message' ? 'mensagem preparada' : 'registrado agora',
    }));
  }

  undoLast(source: Source) {
    const memory = this.read();
    const log = memory.actionLogs.find((item) => !item.undoneAt && item.intent !== 'undo_last_action');
    if (!log || !log.reversible || !log.entityType || !log.entityId) return null;
    const collection = collectionFor(memory, log.entityType);
    const currentIndex = collection.findIndex((item) => item.id === log.entityId);
    if (log.before == null) {
      if (currentIndex >= 0) collection.splice(currentIndex, 1);
    } else if (currentIndex >= 0) {
      collection[currentIndex] = log.before as never;
    } else {
      collection.unshift(log.before as never);
    }
    log.undoneAt = new Date().toISOString();
    memory.actionLogs.unshift({
      id: makeId(), userId: memory.userId, intent: 'undo_last_action', entityType: log.entityType,
      entityId: log.entityId, summary: `Desfeito: ${log.summary}`, createdAt: new Date().toISOString(),
      source, reversible: false, undoneAt: null, before: log.after, after: log.before,
    });
    this.write(memory);
    return log;
  }
}

export function volatileMemoryRepository(initial: OperationalMemory) {
  const values = new Map<string, string>();
  const storage: StorageLike = {
    getItem(key) { return values.get(key) ?? null; },
    setItem(key, value) { values.set(key, value); },
  };
  const repository = new OperationalMemoryRepository(storage);
  repository.write(initial);
  return repository;
}

function collectionFor(memory: OperationalMemory, type: EntityType): Array<{ id: string }> {
  const map = {
    contact: memory.contacts,
    expense: memory.expenses,
    task: memory.tasks,
    reminder: memory.reminders,
    event: memory.events,
    note: memory.notes,
    message: memory.messages,
  };
  return map[type];
}

export function normalize(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR').trim();
}

export function titleCase(value: string) {
  return value.trim().replace(/(^|[\s-])(\p{L})/gu, (_, prefix: string, letter: string) => `${prefix}${letter.toLocaleUpperCase('pt-BR')}`);
}

export function rangeBounds(range: 'today' | 'tomorrow' | 'week' | 'next_week' | 'month' | 'next_month' | 'all', reference = new Date()) {
  const start = new Date(reference);
  const end = new Date(reference);
  if (range === 'all') return { start: new Date(0), end: new Date(8640000000000000) };
  start.setHours(0, 0, 0, 0);
  end.setHours(23, 59, 59, 999);
  if (range === 'tomorrow') { start.setDate(start.getDate() + 1); end.setDate(end.getDate() + 1); }
  if (range === 'week') {
    const day = start.getDay();
    start.setDate(start.getDate() - day);
    end.setDate(start.getDate() + 6);
  }
  if (range === 'next_week') {
    const day = start.getDay();
    start.setDate(start.getDate() - day + 7);
    end.setTime(start.getTime());
    end.setDate(start.getDate() + 6);
    end.setHours(23, 59, 59, 999);
  }
  if (range === 'month') {
    start.setDate(1);
    end.setMonth(start.getMonth() + 1, 0);
  }
  if (range === 'next_month') {
    start.setMonth(start.getMonth() + 1, 1);
    end.setMonth(start.getMonth() + 1, 0);
  }
  return { start, end };
}

export function resolveRange(text: string): 'today' | 'tomorrow' | 'week' | 'next_week' | 'month' | 'next_month' | 'all' {
  const clean = normalize(text);
  if (clean.includes('amanha')) return 'tomorrow';
  if (clean.includes('semana que vem') || clean.includes('proxima semana')) return 'next_week';
  if (clean.includes('mes que vem') || clean.includes('proximo mes')) return 'next_month';
  if (clean.includes('semana')) return 'week';
  if (clean.includes('mes')) return 'month';
  if (clean.includes('hoje')) return 'today';
  return 'all';
}

export function intentLabel(intent: Intent) {
  return ({ create_expense: 'Gasto', create_reminder: 'Lembrete', create_note: 'Anotação', create_task: 'Tarefa', create_event: 'Evento', prepare_whatsapp_message: 'Mensagem', send_whatsapp_message: 'Mensagem enviada' } as Partial<Record<Intent, string>>)[intent] || 'Ação';
}
