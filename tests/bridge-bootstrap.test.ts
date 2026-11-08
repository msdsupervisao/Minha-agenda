import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import test from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';

test('instalação para banco de teste aplica todas as migrations e recusa repetição', async () => {
  await promisify(execFile)(process.execPath, ['scripts/prepare-bridge-test.mjs']);
  const sql = await readFile('.runtime/bridge-test/preparar-banco-de-teste.sql', 'utf8');
  const db = new PGlite({ extensions: { pgcrypto } });
  try {
    await db.exec(`
      create role anon nologin;
      create role authenticated nologin;
      create role service_role nologin;
      create schema auth;
      create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb);
      create function auth.uid() returns uuid language sql stable as $$
        select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
      $$;
      grant usage on schema auth to authenticated, anon;
    `);
    await db.exec(sql);
    const tables = await db.query<{ exists: boolean }>("select to_regclass('public.agent_bridge_jobs') is not null and to_regclass('public.expenses') is not null and to_regclass('public.reminders') is not null as exists");
    assert.equal(tables.rows[0].exists, true);
    await db.exec(await readFile('supabase/tests/bridge-live-rollback.sql', 'utf8'));
    assert.equal((await db.query('select id from auth.users')).rows.length, 0);
    await assert.rejects(db.exec(sql), /banco já contém tabelas/i);
  } finally { await db.close(); }
});
