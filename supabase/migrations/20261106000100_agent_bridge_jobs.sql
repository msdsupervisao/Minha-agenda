-- Fila opt-in da ponte local. Uma execução iniciada nunca é reentregue
-- automaticamente: ela pode ter produzido um efeito antes da desconexão.
create table public.agent_bridge_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  request_id uuid not null,
  input jsonb not null check (jsonb_typeof(input) = 'object' and octet_length(input::text) <= 16000),
  status text not null default 'queued' check (status in ('queued', 'running', 'approval_required', 'completed', 'failed')),
  result jsonb check (result is null or (jsonb_typeof(result) = 'object' and octet_length(result::text) <= 128000)),
  approved boolean not null default false,
  claim_token uuid,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  unique (user_id, request_id)
);

create index agent_bridge_jobs_queue_idx on public.agent_bridge_jobs (user_id, created_at) where status = 'queued';
alter table public.agent_bridge_jobs enable row level security;
revoke all on public.agent_bridge_jobs from anon, authenticated;
grant select on public.agent_bridge_jobs to authenticated;
create policy agent_bridge_jobs_owner_read on public.agent_bridge_jobs for select to authenticated using (user_id = auth.uid());

create function public.agent_bridge_enqueue(p_request_id uuid, p_input jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_existing_input jsonb;
begin
  if auth.uid() is null or p_request_id is null or p_input is null or jsonb_typeof(p_input) <> 'object' or octet_length(p_input::text) > 16000 then
    raise exception 'invalid_bridge_request';
  end if;
  insert into public.agent_bridge_jobs (user_id, request_id, input)
  values (auth.uid(), p_request_id, p_input)
  on conflict (user_id, request_id) do nothing
  returning id into v_id;
  if v_id is null then
    select id, input into v_id, v_existing_input from public.agent_bridge_jobs where user_id = auth.uid() and request_id = p_request_id;
    if v_existing_input is distinct from p_input then raise exception 'bridge_request_id_conflict'; end if;
  end if;
  return v_id;
end $$;

create function public.agent_bridge_claim()
returns table (id uuid, input jsonb, claim_token uuid, approved boolean, prior_result jsonb)
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'unauthorized'; end if;
  return query
    update public.agent_bridge_jobs j
    set status = 'running', started_at = now(), claim_token = gen_random_uuid()
    where j.id = (
      select q.id from public.agent_bridge_jobs q
      where q.user_id = auth.uid() and q.status = 'queued'
      order by q.created_at, q.id for update skip locked limit 1
    )
    returning j.id, j.input, j.claim_token, j.approved, j.result;
end $$;

create function public.agent_bridge_finish(p_id uuid, p_claim_token uuid, p_status text, p_result jsonb)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_count integer;
begin
  if auth.uid() is null or p_status not in ('completed', 'failed', 'approval_required') or p_result is null or jsonb_typeof(p_result) <> 'object' or octet_length(p_result::text) > 128000 then
    raise exception 'invalid_bridge_result';
  end if;
  update public.agent_bridge_jobs j
  set status = p_status, result = p_result, finished_at = now(), claim_token = null
  where j.id = p_id and j.user_id = auth.uid() and j.status = 'running' and j.claim_token = p_claim_token;
  get diagnostics v_count = row_count;
  return v_count = 1;
end $$;

create function public.agent_bridge_decide(p_id uuid, p_decision text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_count integer;
begin
  if auth.uid() is null or p_decision not in ('approve', 'cancel') then raise exception 'invalid_bridge_decision'; end if;
  update public.agent_bridge_jobs j
  set status = case when p_decision = 'approve' then 'queued' else 'completed' end,
      approved = (p_decision = 'approve'),
      result = case when p_decision = 'approve' then j.result else '{"kind":"cancelled","reply":"Tudo bem. Não executei a ação."}'::jsonb end,
      finished_at = case when p_decision = 'approve' then null else now() end
  where j.id = p_id and j.user_id = auth.uid() and j.status = 'approval_required'
    and (p_decision = 'cancel' or j.finished_at > now() - interval '15 minutes');
  get diagnostics v_count = row_count;
  return v_count = 1;
end $$;

revoke all on function public.agent_bridge_enqueue(uuid, jsonb) from public, anon;
revoke all on function public.agent_bridge_claim() from public, anon;
revoke all on function public.agent_bridge_finish(uuid, uuid, text, jsonb) from public, anon;
revoke all on function public.agent_bridge_decide(uuid, text) from public, anon;
grant execute on function public.agent_bridge_enqueue(uuid, jsonb) to authenticated;
grant execute on function public.agent_bridge_claim() to authenticated;
grant execute on function public.agent_bridge_finish(uuid, uuid, text, jsonb) to authenticated;
grant execute on function public.agent_bridge_decide(uuid, text) to authenticated;

-- A presença é apenas um sinal recente; não confirma a entrega de um pedido.
create table public.agent_bridge_presence (
  user_id uuid primary key references auth.users(id) on delete cascade,
  last_seen_at timestamptz not null default now()
);
alter table public.agent_bridge_presence enable row level security;
revoke all on public.agent_bridge_presence from public, anon, authenticated;
grant select on public.agent_bridge_presence to authenticated;
create policy agent_bridge_presence_owner_read on public.agent_bridge_presence for select to authenticated using (user_id = auth.uid());

create function public.agent_bridge_heartbeat()
returns timestamptz language plpgsql security definer set search_path = '' as $$
declare v_now timestamptz := now();
begin
  if auth.uid() is null then raise exception 'unauthorized'; end if;
  insert into public.agent_bridge_presence (user_id, last_seen_at) values (auth.uid(), v_now)
  on conflict (user_id) do update set last_seen_at = excluded.last_seen_at;
  return v_now;
end $$;
revoke all on function public.agent_bridge_heartbeat() from public, anon;
grant execute on function public.agent_bridge_heartbeat() to authenticated;
