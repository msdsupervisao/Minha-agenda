import assert from 'node:assert/strict';
import test from 'node:test';
import type { SupabaseClient } from '@supabase/supabase-js';
import { AuthService } from '../lib/auth/auth-service';
import { runPersistentConversation } from '../lib/assistant/server-conversation';
import { assertMemoryOwner } from '../lib/data/supabase-memory-repository';
import { emptyMemory } from '../lib/assistant/memory';
import { getSupabasePublicConfig } from '../lib/supabase/config';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const userA = '10000000-0000-4000-8000-000000000001';
const userB = '20000000-0000-4000-8000-000000000002';

test('login usa Supabase Auth sem expor credenciais', async () => {
  let received: unknown;
  const service = new AuthService(fakeAuth({ onLogin: (value) => { received = value; } }));
  const user = await service.login('pessoa@example.com', 'senha-segura');
  assert.deepEqual(received, { email: 'pessoa@example.com', password: 'senha-segura' });
  assert.equal(user.id, userA);
});

test('sessão é lida de claims verificados e logout limpa o estado', async () => {
  let active = true;
  const auth = fakeAuth({ active: () => active, onLogout: () => { active = false; } });
  const service = new AuthService(auth);
  assert.equal((await service.currentUser())?.id, userA);
  await service.logout();
  assert.equal(await service.currentUser(), null);
});

test('criação de gasto persiste no repository Supabase', async () => {
  const db = new FakeSupabase();
  const result = await command(db, userA, 'Gastei 30 reais em combustível.');
  assert.equal(result.kind, 'executed');
  assert.equal(db.owned('expenses', userA)[0].amount, 30);
});

test('leitura de gasto usa o dado persistido', async () => {
  const db = new FakeSupabase();
  await command(db, userA, 'Gastei 30 reais em combustível.');
  const result = await command(db, userA, 'Quanto gastei com combustível este mês?');
  assert.equal(result.kind, 'query');
  assert.match(result.reply, /R\$\s*30,00/);
});

test('criação de lembrete persiste data e usuário', async () => {
  const db = new FakeSupabase();
  await command(db, userA, 'Me lembra amanhã às nove de pagar a conta.');
  const reminder = db.owned('reminders', userA)[0];
  assert.equal(reminder.user_id, userA);
  assert.equal(new Date(String(reminder.due_at)).getHours(), 9);
});

test('leitura de lembrete continua funcionando após novo request', async () => {
  const db = new FakeSupabase();
  await command(db, userA, 'Me lembra amanhã às nove de pagar a conta.');
  const result = await command(db, userA, 'O que tenho amanhã?');
  assert.match(result.reply, /pagar a conta/i);
});

test('criação de tarefa persiste no usuário autenticado', async () => {
  const db = new FakeSupabase();
  await command(db, userA, 'Crie uma tarefa revisar a aula.');
  assert.equal(db.owned('tasks', userA)[0].title, 'revisar a aula');
});

test('criação de contato preserva a continuação da conversa', async () => {
  const db = new FakeSupabase();
  assert.equal((await command(db, userA, 'Me lembra amanhã de falar com João.')).kind, 'question');
  assert.equal((await command(db, userA, 'O professor de Designer.')).kind, 'executed');
  assert.equal(db.owned('contacts', userA)[0].class_name, 'Designer');
});

test('migration ativa RLS e quatro policies em todas as tabelas pessoais', () => {
  const sql = readFileSync(join(process.cwd(), 'supabase/migrations/20260819000100_phase5_persistent_memory.sql'), 'utf8');
  for (const table of ['profiles','contacts','expenses','reminders','tasks','notes','events','messages','action_logs','assistant_context','ai_usage_logs']) {
    assert.match(sql, new RegExp(`'${table}'`));
  }
  assert.match(sql, /enable row level security/i);
  for (const operation of ['select', 'insert', 'update', 'delete']) assert.match(sql, new RegExp(`owner_${operation}`));
  assert.match(sql, /to authenticated/i);
  assert.match(sql, /\(select auth\.uid\(\)\) = user_id/i);
});

test('tentativa de acesso cruzado não lê nem grava dados de outro usuário', async () => {
  const db = new FakeSupabase();
  await command(db, userA, 'Gastei 30 reais em combustível.');
  const otherClient = db.client(userB);
  const crossRead = await otherClient.from('expenses').select('*');
  assert.equal(crossRead.data?.length, 0);
  const forged = await otherClient.from('expenses').insert({ id: crypto.randomUUID(), user_id: userA, amount: 1 });
  assert.equal(forged.error?.code, '42501');
  const foreign = emptyMemory();
  foreign.userId = userB;
  assert.throws(() => assertMemoryOwner(foreign, userA), /outro usuário/);
});

test('action log é persistido junto da ação', async () => {
  const db = new FakeSupabase();
  await command(db, userA, 'Gastei 30 reais em combustível.');
  const log = db.owned('action_logs', userA)[0];
  assert.equal(log.intent, 'create_expense');
  assert.equal(log.entity_type, 'expense');
  assert.equal(log.status, 'completed');
});

test('persistência sobrevive ao reload do cliente', async () => {
  const db = new FakeSupabase();
  await command(db, userA, 'Gastei 30 reais em combustível.');
  const reloadedClient = db.client(userA);
  const result = await runPersistentConversation(reloadedClient, userA, 'Quanto gastei com combustível este mês?', 'text');
  assert.match(result.reply, /R\$\s*30,00/);
});

test('persistência sobrevive a logout/login e volta para o assistente', async () => {
  const db = new FakeSupabase();
  await command(db, userA, 'Me lembra amanhã às nove de pagar a conta.');
  let active = true;
  const auth = new AuthService(fakeAuth({ active: () => active, onLogout: () => { active = false; } }));
  await auth.logout();
  active = true;
  assert.equal((await auth.currentUser())?.id, userA);
  const result = await command(db, userA, 'O que tenho amanhã?');
  assert.match(result.reply, /pagar a conta/i);
  assert.equal(getSupabasePublicConfig({ NEXT_PUBLIC_SUPABASE_URL: 'https://project.supabase.co', NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test' }).configured, true);
});

async function command(db: FakeSupabase, userId: string, text: string) {
  return runPersistentConversation(db.client(userId), userId, text, 'text');
}

function fakeAuth(options: { active?: () => boolean; onLogin?: (value: unknown) => void; onLogout?: () => void } = {}) {
  return {
    async signInWithPassword(value: { email: string; password: string }) { options.onLogin?.(value); return { data: { user: { id: userA, email: value.email } }, error: null }; },
    async getClaims() { return options.active?.() === false ? { data: null, error: { message: 'expired' } } : { data: { claims: { sub: userA, email: 'pessoa@example.com' } }, error: null }; },
    async signOut() { options.onLogout?.(); return { error: null }; },
  };
}

type Row = Record<string, unknown>;
type Result = { data: Row[] | Row | null; error: { code: string; message: string } | null };

class FakeSupabase {
  private tables = new Map<string, Row[]>();
  client(userId: string) { return { from: (table: string) => new FakeQuery(this, table, userId) } as unknown as SupabaseClient; }
  owned(table: string, userId: string) { return this.rows(table).filter((row) => row.user_id === userId); }
  rows(table: string) { if (!this.tables.has(table)) this.tables.set(table, []); return this.tables.get(table)!; }
}

class FakeQuery implements PromiseLike<Result> {
  private operation: 'select' | 'delete' = 'select';
  private filters: Array<(row: Row) => boolean> = [];
  private orderColumn: string | null = null;
  private ascending = true;
  private max = Infinity;
  constructor(private db: FakeSupabase, private table: string, private userId: string) {}
  select(_columns = '*') { this.operation = 'select'; return this; }
  delete() { this.operation = 'delete'; return this; }
  eq(column: string, value: unknown) { this.filters.push((row) => row[column] === value); return this; }
  is(column: string, value: unknown) { this.filters.push((row) => (row[column] ?? null) === value); return this; }
  in(column: string, values: unknown[]) { this.filters.push((row) => values.includes(row[column])); return this; }
  order(column: string, options?: { ascending?: boolean }) { this.orderColumn = column; this.ascending = options?.ascending !== false; return this; }
  limit(value: number) { this.max = value; return this; }
  async maybeSingle() { const result = await this.execute(); const rows = result.data as Row[]; return { data: rows[0] || null, error: rows.length > 1 ? { code: 'PGRST116', message: 'multiple' } : null }; }
  async single() { const result = await this.execute(); const rows = result.data as Row[]; return rows.length === 1 ? { data: rows[0], error: null } : { data: null, error: { code: 'PGRST116', message: 'not single' } }; }
  async insert(value: Row | Row[]) { return this.write(value, 'id'); }
  async upsert(value: Row | Row[], options?: { onConflict?: string }) { return this.write(value, options?.onConflict || 'id'); }
  then<TResult1 = Result, TResult2 = never>(onfulfilled?: ((value: Result) => TResult1 | PromiseLike<TResult1>) | null, onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null) { return this.execute().then(onfulfilled, onrejected); }

  private async write(value: Row | Row[], conflict: string): Promise<Result> {
    const values: Row[] = (Array.isArray(value) ? value : [value]).map((row) => ({ ...row, id: row.id || crypto.randomUUID(), created_at: row.created_at || new Date().toISOString(), updated_at: row.updated_at || new Date().toISOString() } as Row));
    if (values.some((row) => row.user_id !== this.userId)) return denied();
    const rows = this.db.rows(this.table);
    for (const valueRow of values) {
      const index = rows.findIndex((row) => row[conflict] === valueRow[conflict]);
      if (index >= 0 && rows[index].user_id !== this.userId) return denied();
      if (index >= 0) rows[index] = { ...rows[index], ...valueRow };
      else rows.push(valueRow);
    }
    return { data: values, error: null };
  }

  private async execute(): Promise<Result> {
    const all = this.db.rows(this.table);
    let rows = all.filter((row) => row.user_id === this.userId && this.filters.every((filter) => filter(row)));
    if (this.operation === 'delete') {
      const removed = new Set(rows);
      const kept = all.filter((row) => !removed.has(row));
      all.splice(0, all.length, ...kept);
      return { data: rows, error: null };
    }
    if (this.orderColumn) rows = [...rows].sort((a, b) => String(a[this.orderColumn!]).localeCompare(String(b[this.orderColumn!])) * (this.ascending ? 1 : -1));
    return { data: rows.slice(0, this.max).map((row) => ({ ...row })), error: null };
  }
}

function denied(): Result { return { data: null, error: { code: '42501', message: 'row-level security' } }; }
