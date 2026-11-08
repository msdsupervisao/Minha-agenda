import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { PGlite } from '@electric-sql/pglite';

test('fila SQL isola usuários, protege a reserva e retoma apenas uma aprovação', async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon nologin;
      create role authenticated nologin;
      create schema auth;
      create table auth.users (id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$
        select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
      $$;
      grant usage on schema auth to authenticated, anon;
      insert into auth.users values ('11111111-1111-4111-8111-111111111111'), ('22222222-2222-4222-8222-222222222222');
    `);
    await db.exec(await readFile('supabase/migrations/20261106000100_agent_bridge_jobs.sql', 'utf8'));
    await db.exec("set role authenticated; select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',false)");
    await db.query('select public.agent_bridge_heartbeat()');
    assert.equal((await db.query('select user_id from public.agent_bridge_presence')).rows.length, 1);
    const payload = JSON.stringify({ text: 'Gastei 60 reais', source: 'voice', timezone: 'America/Cuiaba' });
    const requestId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const first = await db.query<{ id: string }>('select public.agent_bridge_enqueue($1::uuid, $2::jsonb) as id', [requestId, payload]);
    const second = await db.query<{ id: string }>('select public.agent_bridge_enqueue($1::uuid, $2::jsonb) as id', [requestId, payload]);
    assert.equal(first.rows[0].id, second.rows[0].id);
    await assert.rejects(db.query('select public.agent_bridge_enqueue($1::uuid, $2::jsonb)', [requestId, JSON.stringify({ text: 'outro' })]));
    await assert.rejects(db.query("update public.agent_bridge_jobs set status = 'completed'"));
    const claim = await db.query<{ id: string; claim_token: string }>('select * from public.agent_bridge_claim()');
    assert.equal(claim.rows.length, 1);
    assert.equal((await db.query('select * from public.agent_bridge_claim()')).rows.length, 0);
    const job = claim.rows[0];
    await db.exec("select set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',false)");
    assert.equal((await db.query('select user_id from public.agent_bridge_presence')).rows.length, 0);
    assert.equal((await db.query('select id from public.agent_bridge_jobs')).rows.length, 0);
    assert.equal((await db.query<{ ok: boolean }>('select public.agent_bridge_finish($1,$2,$3,$4::jsonb) as ok', [job.id, job.claim_token, 'completed', '{}'])).rows[0].ok, false);
    await db.exec("select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',false)");
    const approval = JSON.stringify({ kind: 'approval_required', reply: 'Confirma?', pendingCalls: [{ callId: 'a', name: 'example', arguments: {} }], continuation: {} });
    assert.equal((await db.query<{ ok: boolean }>('select public.agent_bridge_finish($1,$2,$3,$4::jsonb) as ok', [job.id, job.claim_token, 'approval_required', approval])).rows[0].ok, true);
    assert.equal((await db.query<{ ok: boolean }>('select public.agent_bridge_decide($1,$2) as ok', [job.id, 'approve'])).rows[0].ok, true);
    assert.equal((await db.query<{ ok: boolean }>('select public.agent_bridge_decide($1,$2) as ok', [job.id, 'approve'])).rows[0].ok, false);
    const resumed = (await db.query<{ approved: boolean; claim_token: string; prior_result: { kind: string } }>('select * from public.agent_bridge_claim()')).rows[0];
    assert.equal(resumed.approved, true);
    assert.equal(resumed.prior_result.kind, 'approval_required');
    assert.equal((await db.query<{ ok: boolean }>('select public.agent_bridge_finish($1,$2,$3,$4::jsonb) as ok', [job.id, job.claim_token, 'completed', '{}'])).rows[0].ok, false);
    assert.equal((await db.query<{ ok: boolean }>('select public.agent_bridge_finish($1,$2,$3,$4::jsonb) as ok', [job.id, resumed.claim_token, 'completed', '{"kind":"completed"}'])).rows[0].ok, true);

    const expiredId = (await db.query<{ id: string }>('select public.agent_bridge_enqueue($1::uuid,$2::jsonb) as id', ['bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', payload])).rows[0].id;
    const expired = (await db.query<{ claim_token: string }>('select * from public.agent_bridge_claim()')).rows[0];
    await db.query('select public.agent_bridge_finish($1,$2,$3,$4::jsonb)', [expiredId, expired.claim_token, 'approval_required', approval]);
    await db.exec("reset role; update public.agent_bridge_jobs set finished_at = now() - interval '16 minutes'; set role authenticated");
    assert.equal((await db.query<{ ok: boolean }>('select public.agent_bridge_decide($1,$2) as ok', [expiredId, 'approve'])).rows[0].ok, false);
    assert.equal((await db.query<{ ok: boolean }>('select public.agent_bridge_decide($1,$2) as ok', [expiredId, 'cancel'])).rows[0].ok, true);
  } finally { await db.close(); }
});
