import assert from 'node:assert/strict';
import test from 'node:test';
import { ToolRegistry } from '../lib/agent/tool-registry';
import { createPersonalAgendaTools, agendaRange } from '../lib/agent/tools/personal-agenda';
import { emptyAgentContextState, type AgentExecutionContext } from '../lib/agent/contracts';
import type { PersonalAgendaStore, SavedNote, SavedReminder } from '../lib/data/agent-personal-repository';

const context: AgentExecutionContext = { userId: 'owner', source: 'text', now: new Date('2026-09-06T14:00:00Z'), timezone: 'America/Cuiaba', state: emptyAgentContextState() };
class MemoryStore implements PersonalAgendaStore {
  note: SavedNote | null = null;
  reminder: SavedReminder | null = null;
  writes = 0;
  async agenda(userId: string, from: string, until: string) { assert.equal(userId, context.userId); assert.equal(from, '2026-09-06T04:00:00.000Z'); assert.equal(until, '2026-09-07T04:00:00.000Z'); return { items: [{ id: 'event-real', kind: 'event', title: 'Aula', at: '2026-09-06T18:00:00Z', status: null }], possiblyTruncated: false }; }
  async contacts() { return [{ id: 'real-contact', name: 'José', aliases: ['Zé'], role: null, className: null }]; }
  async createNote(userId: string, content: string) { assert.equal(userId, context.userId); this.writes++; this.note = { id: 'note-real', content }; return this.note.id; }
  async getNote(userId: string, id: string) { assert.equal(userId, context.userId); return id === this.note?.id ? this.note : null; }
  async createReminder(userId: string, title: string, dueAt: string) { assert.equal(userId, context.userId); this.writes++; this.reminder = { id: 'reminder-real', title, dueAt, notificationStatus: 'pending' }; return this.reminder.id; }
  async getReminder(userId: string, id: string) { assert.equal(userId, context.userId); return id === this.reminder?.id ? this.reminder : null; }
}

test('agenda usa período local inclusivo e não fabrica dados fora da fonte', async () => {
  const registry = new ToolRegistry(createPersonalAgendaTools(new MemoryStore()));
  const result = await registry.execute({ callId: 'agenda', name: 'list_agenda', arguments: { fromDate: '2026-09-06', toDate: '2026-09-06' } }, context);
  assert.equal(result.verified, true);
  assert.match(JSON.stringify(result.output), /event-real/);
  assert.throws(() => agendaRange('2026-02-30', '2026-03-01', 'America/Cuiaba'), /invalid_agenda_period/);
  assert.throws(() => agendaRange('2026-09-06', '2026-01-01', 'America/Cuiaba'), /invalid_agenda_period/);
  const contact = await registry.execute({ callId: 'contacts', name: 'find_contacts', arguments: { query: 'Ze' } }, context);
  assert.match(JSON.stringify(contact.output), /real-contact/);
});

test('anotação requer releitura do conteúdo salvo e do usuário correto', async () => {
  const store = new MemoryStore();
  const registry = new ToolRegistry(createPersonalAgendaTools(store));
  const result = await registry.execute({ callId: 'note', name: 'create_note', arguments: { content: 'Preparar a aula.' } }, context);
  assert.equal(result.verified, true);
  store.getNote = async () => ({ id: 'note-real', content: 'conteúdo diferente' });
  const failed = await registry.execute({ callId: 'bad-note', name: 'create_note', arguments: { content: 'Anote isto.' } }, context);
  assert.equal(failed.errorCode, 'verification_failed');
});

test('lembrete calcula prazo no servidor, verifica persistência e não afirma entrega de notificação', async () => {
  const store = new MemoryStore();
  const registry = new ToolRegistry(createPersonalAgendaTools(store));
  const result = await registry.execute({ callId: 'reminder', name: 'create_reminder', arguments: { title: 'Preparar a aula', scheduleKind: 'delay_minutes', delayMinutes: 30, localDueAt: null } }, context);
  assert.equal(result.verified, true);
  assert.equal(store.reminder?.dueAt, '2026-09-06T14:30:00.000Z');
  assert.equal((result.output as { deliveryConfirmed: boolean }).deliveryConfirmed, false);
  const invalid = await registry.execute({ callId: 'invalid', name: 'create_reminder', arguments: { title: 'Inválido', scheduleKind: 'local_datetime', localDueAt: '2026-09-31T24:99', delayMinutes: null } }, context);
  assert.equal(invalid.errorCode, 'invalid_arguments');
  assert.equal(store.writes, 1);
});
