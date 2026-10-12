import type { SupabaseClient } from '@supabase/supabase-js';

export type AgendaItem = { id: string; kind: string; title: string; at: string; status: string | null };
export type PersonalContact = { id: string; name: string; aliases: string[]; role: string | null; className: string | null };
export type SavedNote = { id: string; content: string };
export type SavedReminder = { id: string; title: string; dueAt: string; notificationStatus: string };
export type SavedLongTermMemory = { id: string; kind: 'preference' | 'fact' | 'entity' | 'alias' | 'routine'; content: string; origin: 'explicit_user' | 'user_confirmed'; createdAt: string };
export interface PersonalAgendaStore {
  agenda(userId: string, from: string, until: string): Promise<{ items: AgendaItem[]; possiblyTruncated: boolean }>;
  contacts(userId: string): Promise<PersonalContact[]>;
  createNote(userId: string, content: string): Promise<string>;
  getNote(userId: string, id: string): Promise<SavedNote | null>;
  createReminder(userId: string, title: string, dueAt: string): Promise<string>;
  getReminder(userId: string, id: string): Promise<SavedReminder | null>;
  listLongTermMemory?(userId: string): Promise<SavedLongTermMemory[]>;
  addLongTermMemory?(userId: string, memory: Omit<SavedLongTermMemory, 'id' | 'createdAt'>): Promise<SavedLongTermMemory>;
  deleteLongTermMemory?(userId: string, id: string): Promise<boolean>;
}

export function createSupabasePersonalAgendaStore(client: SupabaseClient): PersonalAgendaStore {
  return {
    async agenda(userId, from, until) {
      const results = await Promise.all([
        client.from('events').select('id,title,starts_at').eq('user_id', userId).is('deleted_at', null).gte('starts_at', from).lt('starts_at', until).order('starts_at').limit(200),
        client.from('tasks').select('id,title,due_at,status').eq('user_id', userId).is('deleted_at', null).gte('due_at', from).lt('due_at', until).order('due_at').limit(200),
        client.from('reminders').select('id,title,due_at,notification_status').eq('user_id', userId).is('deleted_at', null).gte('due_at', from).lt('due_at', until).order('due_at').limit(200),
      ]);
      if (results.some((result) => result.error)) throw new Error('agenda_read_failed');
      const items: AgendaItem[] = results.flatMap((result, index) => (result.data || []).map((row) => {
        const item = row as unknown as Record<string, string>;
        return { id: item.id, kind: ['event', 'task', 'reminder'][index], title: item.title, at: item.starts_at || item.due_at, status: item.status || item.notification_status || null };
      }));
      return { items: items.sort((a, b) => a.at.localeCompare(b.at)), possiblyTruncated: results.some((result) => result.data?.length === 200) };
    },
    async contacts(userId) {
      const { data, error } = await client.from('contacts').select('id,name,aliases,role,class_name').eq('user_id', userId).is('deleted_at', null).order('name').limit(300);
      if (error) throw new Error('contacts_read_failed');
      return (data || []).map((row) => ({ id: row.id, name: row.name, aliases: row.aliases || [], role: row.role, className: row.class_name }));
    },
    async createNote(userId, content) {
      const { data, error } = await client.from('notes').insert({ user_id: userId, content, metadata: { origin: 'agent' } }).select('id').single();
      if (error || !data) throw new Error('note_write_failed');
      return data.id;
    },
    async getNote(userId, id) {
      const { data, error } = await client.from('notes').select('id,content').eq('id', id).eq('user_id', userId).is('deleted_at', null).maybeSingle();
      if (error) throw new Error('note_verification_failed');
      return data;
    },
    async createReminder(userId, title, dueAt) {
      const { data, error } = await client.from('reminders').insert({ user_id: userId, title, due_at: dueAt, metadata: { origin: 'agent' } }).select('id').single();
      if (error || !data) throw new Error('reminder_write_failed');
      return data.id;
    },
    async getReminder(userId, id) {
      const { data, error } = await client.from('reminders').select('id,title,due_at,notification_status').eq('id', id).eq('user_id', userId).is('deleted_at', null).maybeSingle();
      if (error) throw new Error('reminder_verification_failed');
      return data ? { id: data.id, title: data.title, dueAt: data.due_at, notificationStatus: data.notification_status } : null;
    },
    async listLongTermMemory(userId) {
      const { data, error } = await client.from('agent_contexts').select('long_term_memory').eq('user_id', userId).maybeSingle();
      if (error) throw new Error('memory_read_failed');
      return (Array.isArray(data?.long_term_memory) ? data.long_term_memory : []).filter(isSavedLongTermMemory).slice(-50);
    },
    async addLongTermMemory(userId, memory) {
      const current = await readLongTermMemory(client, userId);
      const duplicate = current.find((item) => item.kind === memory.kind && item.content.toLocaleLowerCase('pt-BR') === memory.content.toLocaleLowerCase('pt-BR'));
      if (duplicate) return duplicate;
      const saved: SavedLongTermMemory = { ...memory, id: crypto.randomUUID(), createdAt: new Date().toISOString() };
      const { error } = await client.from('agent_contexts').upsert({ user_id: userId, long_term_memory: [...current, saved].slice(-50), updated_at: saved.createdAt }, { onConflict: 'user_id' });
      if (error) throw new Error('memory_write_failed');
      return saved;
    },
    async deleteLongTermMemory(userId, id) {
      const current = await readLongTermMemory(client, userId);
      if (!current.some((item) => item.id === id)) return false;
      const { error } = await client.from('agent_contexts').upsert({ user_id: userId, long_term_memory: current.filter((item) => item.id !== id), updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
      if (error) throw new Error('memory_write_failed');
      return true;
    },
  };
}

async function readLongTermMemory(client: SupabaseClient, userId: string) {
  const { data, error } = await client.from('agent_contexts').select('long_term_memory').eq('user_id', userId).maybeSingle();
  if (error) throw new Error('memory_read_failed');
  return (Array.isArray(data?.long_term_memory) ? data.long_term_memory : []).filter(isSavedLongTermMemory).slice(-50);
}

function isSavedLongTermMemory(value: unknown): value is SavedLongTermMemory {
  if (!value || typeof value !== 'object') return false;
  const item = value as Record<string, unknown>;
  return typeof item.id === 'string' && typeof item.content === 'string'
    && ['preference', 'fact', 'entity', 'alias', 'routine'].includes(String(item.kind))
    && ['explicit_user', 'user_confirmed'].includes(String(item.origin)) && typeof item.createdAt === 'string';
}
