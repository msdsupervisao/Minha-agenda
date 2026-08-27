-- Contexto próprio do novo núcleo. Não mistura observações de ferramentas com a
-- memória operacional legada baseada em intents fixas.

create table public.agent_contexts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  recent_turns jsonb not null default '[]'::jsonb check (jsonb_typeof(recent_turns) = 'array'),
  summary text,
  focus jsonb,
  operational_memory jsonb not null default '{}'::jsonb check (jsonb_typeof(operational_memory) = 'object'),
  long_term_memory jsonb not null default '[]'::jsonb check (jsonb_typeof(long_term_memory) = 'array'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.agent_contexts enable row level security;
grant select, insert, update, delete on table public.agent_contexts to authenticated;

create policy "owner_select" on public.agent_contexts
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "owner_insert" on public.agent_contexts
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "owner_update" on public.agent_contexts
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "owner_delete" on public.agent_contexts
  for delete to authenticated using ((select auth.uid()) = user_id);
