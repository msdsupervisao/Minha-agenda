-- MINHA-AGENDA — Fase 6: turmas do usuário.
-- Depende de public.set_updated_at() e da extensão pgcrypto (criados na fase 5).

create table public.classes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(trim(name)) > 0),
  course text,
  schedule text,
  teacher text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint classes_id_user_unique unique (id, user_id)
);

create index classes_user_created_idx on public.classes (user_id, created_at desc);

alter table public.classes enable row level security;
revoke all on table public.classes from anon;
grant select, insert, update, delete on table public.classes to authenticated;

create policy "owner_select" on public.classes for select to authenticated using ((select auth.uid()) = user_id);
create policy "owner_insert" on public.classes for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "owner_update" on public.classes for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "owner_delete" on public.classes for delete to authenticated using ((select auth.uid()) = user_id);

create trigger set_classes_updated_at before update on public.classes for each row execute function public.set_updated_at();
