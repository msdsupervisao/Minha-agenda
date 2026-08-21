-- MINHA-AGENDA — Fase 7: notificações push de lembretes.
-- Depende de public.set_updated_at() e pgcrypto (criados na fase 5).

-- marca quando o push do lembrete já foi disparado (separado de "concluído").
alter table public.reminders add column if not exists notified_at timestamptz;

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint push_subscriptions_user_endpoint_unique unique (user_id, endpoint)
);

create index push_subscriptions_user_idx on public.push_subscriptions (user_id);
create index reminders_due_notify_idx on public.reminders (due_at) where notified_at is null and deleted_at is null;

alter table public.push_subscriptions enable row level security;
revoke all on table public.push_subscriptions from anon;
grant select, insert, update, delete on table public.push_subscriptions to authenticated;

create policy "owner_select" on public.push_subscriptions for select to authenticated using ((select auth.uid()) = user_id);
create policy "owner_insert" on public.push_subscriptions for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "owner_update" on public.push_subscriptions for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "owner_delete" on public.push_subscriptions for delete to authenticated using ((select auth.uid()) = user_id);

create trigger set_push_subscriptions_updated_at before update on public.push_subscriptions for each row execute function public.set_updated_at();
