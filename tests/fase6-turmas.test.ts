import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createClass, deleteClass, listClasses, updateClass, validateClassInput } from '../lib/data/classes-repository';

const userA = '10000000-0000-4000-8000-000000000001';
const userB = '20000000-0000-4000-8000-000000000002';

const input = (name: string, extra: Partial<Record<string, string | null>> = {}) => ({
  name, course: null, schedule: null, teacher: null, notes: null, ...extra,
});

// --- Fake Supabase com semântica de RLS (client atado a um usuário) ---
type Row = Record<string, unknown>;

class FakeClassesDb {
  rows: Row[] = [];
  client(userId: string) {
    return { from: () => new FakeQuery(this.rows, userId) } as unknown as SupabaseClient;
  }
}

class FakeQuery {
  private op: 'select' | 'update' | 'delete' = 'select';
  private eqs: Array<[string, unknown]> = [];
  private patch: Row = {};
  private orderCol: string | null = null;
  private asc = true;
  constructor(private rows: Row[], private userId: string) {}
  select(_c = '*') { this.op = 'select'; return this; }
  eq(column: string, value: unknown) { this.eqs.push([column, value]); return this; }
  order(column: string, options?: { ascending?: boolean }) { this.orderCol = column; this.asc = options?.ascending !== false; return this; }
  limit(_n: number) { return this; }
  update(patch: Row) { this.op = 'update'; this.patch = patch; return this; }
  delete() { this.op = 'delete'; return this; }
  async insert(value: Row) {
    if (value.user_id !== this.userId) return { data: null, error: { code: '42501', message: 'rls' } };
    const now = new Date().toISOString();
    this.rows.push({ id: value.id || crypto.randomUUID(), created_at: now, updated_at: now, ...value });
    return { data: null, error: null };
  }
  private match(row: Row) { return row.user_id === this.userId && this.eqs.every(([c, v]) => row[c] === v); }
  then<T>(onF?: ((value: { data: Row[] | null; error: unknown }) => T) | null, onR?: ((r: unknown) => T) | null) {
    return this.exec().then(onF, onR);
  }
  private async exec() {
    if (this.op === 'update') { this.rows.filter((r) => this.match(r)).forEach((r) => Object.assign(r, this.patch, { updated_at: new Date().toISOString() })); return { data: null, error: null }; }
    if (this.op === 'delete') { const keep = this.rows.filter((r) => !this.match(r)); this.rows.splice(0, this.rows.length, ...keep); return { data: null, error: null }; }
    let out = this.rows.filter((r) => this.match(r));
    if (this.orderCol) { const col = this.orderCol; out = [...out].sort((a, b) => String(a[col]).localeCompare(String(b[col])) * (this.asc ? 1 : -1)); }
    return { data: out.map((r) => ({ ...r })), error: null };
  }
}

test('turmas: estado vazio retorna lista vazia', async () => {
  const db = new FakeClassesDb();
  assert.deepEqual(await listClasses(db.client(userA), userA), []);
});

test('turmas: criar e listar (com persistência após "reload")', async () => {
  const db = new FakeClassesDb();
  const created = await createClass(db.client(userA), userA, input('Design B', { course: 'Designer', teacher: 'Ana', schedule: 'Seg 19h' }));
  assert.equal(created.ok, true);

  // novo client sobre o mesmo banco = simula reload
  const rows = await listClasses(db.client(userA), userA);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].name, 'Design B');
  assert.equal(rows[0].course, 'Designer');
  assert.equal(rows[0].teacher, 'Ana');
  assert.equal(rows[0].userId, userA);
});

test('turmas: editar altera os campos', async () => {
  const db = new FakeClassesDb();
  await createClass(db.client(userA), userA, input('Turma X'));
  const id = (await listClasses(db.client(userA), userA))[0].id;
  const updated = await updateClass(db.client(userA), userA, id, input('Turma X', { course: 'Fotografia', schedule: 'Qua 20h' }));
  assert.equal(updated.ok, true);
  const rows = await listClasses(db.client(userA), userA);
  assert.equal(rows[0].course, 'Fotografia');
  assert.equal(rows[0].schedule, 'Qua 20h');
});

test('turmas: excluir remove a turma', async () => {
  const db = new FakeClassesDb();
  await createClass(db.client(userA), userA, input('Some'));
  const id = (await listClasses(db.client(userA), userA))[0].id;
  assert.equal((await deleteClass(db.client(userA), userA, id)).ok, true);
  assert.deepEqual(await listClasses(db.client(userA), userA), []);
});

test('turmas: validação exige nome', async () => {
  const db = new FakeClassesDb();
  assert.equal(validateClassInput(input('   ')), 'O nome da turma não pode ficar vazio.');
  const result = await createClass(db.client(userA), userA, input('  '));
  assert.equal(result.ok, false);
  assert.deepEqual(await listClasses(db.client(userA), userA), []);
});

test('turmas: isolamento entre usuários (RLS)', async () => {
  const db = new FakeClassesDb();
  await createClass(db.client(userB), userB, input('Turma do B'));

  // A não enxerga a turma de B
  assert.deepEqual(await listClasses(db.client(userA), userA), []);

  // A tenta editar/excluir por id não afeta a turma de B
  const idB = (await listClasses(db.client(userB), userB))[0].id;
  await updateClass(db.client(userA), userA, idB, input('Invadida'));
  await deleteClass(db.client(userA), userA, idB);
  const bRows = await listClasses(db.client(userB), userB);
  assert.equal(bRows.length, 1);
  assert.equal(bRows[0].name, 'Turma do B');

  // inserção forjada com user_id de outro é negada pelo RLS
  const forged = await db.client(userA).from('classes').insert({ user_id: userB, name: 'forja' });
  assert.equal((forged.error as { code?: string })?.code, '42501');
});

test('turmas: erro de carregamento propaga', async () => {
  const broken = {
    from: () => ({
      select() { return this; }, eq() { return this; }, order() { return this; }, limit() { return this; },
      then<T>(onF: (v: { data: null; error: unknown }) => T) { return Promise.resolve({ data: null, error: { code: 'X', message: 'boom' } }).then(onF); },
    }),
  } as unknown as SupabaseClient;
  await assert.rejects(() => listClasses(broken, userA), /load:classes/);
});

test('turmas: migration cria tabela, RLS, 4 policies e índice', () => {
  const sql = readFileSync(join(process.cwd(), 'supabase/migrations/20260820000200_phase6_classes.sql'), 'utf8');
  assert.match(sql, /create table public\.classes/i);
  for (const column of ['user_id', 'name', 'course', 'schedule', 'teacher', 'notes']) assert.match(sql, new RegExp(`\\b${column}\\b`));
  assert.match(sql, /enable row level security/i);
  for (const operation of ['select', 'insert', 'update', 'delete']) assert.match(sql, new RegExp(`owner_${operation}`));
  assert.match(sql, /to authenticated/i);
  assert.match(sql, /\(select auth\.uid\(\)\) = user_id/i);
  assert.match(sql, /classes_user_created_idx/i);
});
