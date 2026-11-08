-- Teste sintético e transacional. Tudo é revertido antes do término.
begin;
create temporary table bridge_test_ids (
  user_a uuid not null default gen_random_uuid(),
  user_b uuid not null default gen_random_uuid(),
  request_id uuid not null default gen_random_uuid(),
  job_id uuid,
  first_claim uuid,
  second_claim uuid
) on commit drop;
insert into bridge_test_ids default values;
insert into auth.users (id, email, raw_user_meta_data)
select user_a, 'bridge-test-a@example.invalid', '{}'::jsonb from bridge_test_ids
union all
select user_b, 'bridge-test-b@example.invalid', '{}'::jsonb from bridge_test_ids;
grant select, update on bridge_test_ids to authenticated;

set local role authenticated;
select set_config('request.jwt.claim.sub', (select user_a::text from bridge_test_ids), true);
do $$
declare v_id uuid; v_second uuid; v_claim uuid; v_count integer;
begin
  select public.agent_bridge_enqueue(request_id, '{"text":"Gasto fictício","source":"text","timezone":"America/Cuiaba"}'::jsonb) into v_id from bridge_test_ids;
  select public.agent_bridge_enqueue(request_id, '{"text":"Gasto fictício","source":"text","timezone":"America/Cuiaba"}'::jsonb) into v_second from bridge_test_ids;
  if v_id is distinct from v_second then raise exception 'deduplicação falhou'; end if;
  select claim_token into v_claim from public.agent_bridge_claim();
  if v_claim is null then raise exception 'reserva falhou'; end if;
  select count(*) into v_count from public.agent_bridge_claim();
  if v_count <> 0 then raise exception 'pedido foi reservado duas vezes'; end if;
  update bridge_test_ids set job_id = v_id, first_claim = v_claim;
  perform public.agent_bridge_heartbeat();
end $$;

select set_config('request.jwt.claim.sub', (select user_b::text from bridge_test_ids), true);
do $$
declare v_count integer; v_finished boolean;
begin
  select count(*) into v_count from public.agent_bridge_jobs;
  if v_count <> 0 then raise exception 'isolamento da fila falhou'; end if;
  select count(*) into v_count from public.agent_bridge_presence;
  if v_count <> 0 then raise exception 'isolamento da presença falhou'; end if;
  select public.agent_bridge_finish(job_id, first_claim, 'completed', '{}'::jsonb) into v_finished from bridge_test_ids;
  if v_finished then raise exception 'outra conta conseguiu concluir o pedido'; end if;
end $$;

select set_config('request.jwt.claim.sub', (select user_a::text from bridge_test_ids), true);
do $$
declare v_ok boolean; v_claim uuid; v_prior jsonb; v_approved boolean;
begin
  select public.agent_bridge_finish(job_id, first_claim, 'approval_required', '{"kind":"approval_required","reply":"Confirma?","pendingCalls":[],"continuation":{}}'::jsonb) into v_ok from bridge_test_ids;
  if not v_ok then raise exception 'não salvou confirmação'; end if;
  select public.agent_bridge_decide(job_id, 'approve') into v_ok from bridge_test_ids;
  if not v_ok then raise exception 'não confirmou'; end if;
  select public.agent_bridge_decide(job_id, 'approve') into v_ok from bridge_test_ids;
  if v_ok then raise exception 'confirmou duas vezes'; end if;
  select claim_token, prior_result, approved into v_claim, v_prior, v_approved from public.agent_bridge_claim();
  if v_claim is null or not v_approved or v_prior->>'kind' <> 'approval_required' then raise exception 'retomada inválida'; end if;
  select public.agent_bridge_finish(job_id, first_claim, 'completed', '{}'::jsonb) into v_ok from bridge_test_ids;
  if v_ok then raise exception 'reserva antiga ainda válida'; end if;
  select public.agent_bridge_finish(job_id, v_claim, 'completed', '{"kind":"completed","reply":"Teste"}'::jsonb) into v_ok from bridge_test_ids;
  if not v_ok then raise exception 'não concluiu pedido'; end if;
end $$;
reset role;
rollback;
