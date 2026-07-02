-- Rode este SQL no painel do Supabase: SQL Editor > New query > cole e execute (RUN)

create table if not exists public.compromissos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  titulo text not null,
  descricao text,
  data date not null,
  hora time,
  categoria text default 'geral',
  concluido boolean default false,
  created_at timestamptz default now()
);

alter table public.compromissos enable row level security;

-- Cada pessoa só vê e edita os próprios compromissos
create policy "Ver os próprios compromissos"
  on public.compromissos for select
  using (auth.uid() = user_id);

create policy "Criar os próprios compromissos"
  on public.compromissos for insert
  with check (auth.uid() = user_id);

create policy "Editar os próprios compromissos"
  on public.compromissos for update
  using (auth.uid() = user_id);

create policy "Excluir os próprios compromissos"
  on public.compromissos for delete
  using (auth.uid() = user_id);

create index if not exists compromissos_user_data_idx
  on public.compromissos (user_id, data);
