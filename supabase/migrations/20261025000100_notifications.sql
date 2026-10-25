-- Motor de notificações por item/antecedência/canal.
create table if not exists public.notification_deliveries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  item_type text not null check (item_type in ('reminder', 'event', 'task')),
  item_id uuid not null,
  anchor_at timestamptz not null,
  offset_minutes integer not null check (offset_minutes >= 0),
  channel text not null check (channel in ('push', 'whatsapp')),
  fire_at timestamptz not null,
  dedupe_key text not null unique,
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed', 'skipped')),
  error text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists notification_deliveries_user_fire_idx on public.notification_deliveries (user_id, fire_at);
create index if not exists notification_deliveries_status_idx on public.notification_deliveries (status, fire_at);

alter table public.notification_deliveries enable row level security;
revoke all on table public.notification_deliveries from anon;
grant select, insert, update, delete on table public.notification_deliveries to authenticated;

drop policy if exists "owner_select" on public.notification_deliveries;
drop policy if exists "owner_insert" on public.notification_deliveries;
drop policy if exists "owner_update" on public.notification_deliveries;
drop policy if exists "owner_delete" on public.notification_deliveries;
create policy "owner_select" on public.notification_deliveries for select to authenticated using ((select auth.uid()) = user_id);
create policy "owner_insert" on public.notification_deliveries for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "owner_update" on public.notification_deliveries for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "owner_delete" on public.notification_deliveries for delete to authenticated using ((select auth.uid()) = user_id);

drop trigger if exists set_notification_deliveries_updated_at on public.notification_deliveries;
create trigger set_notification_deliveries_updated_at before update on public.notification_deliveries for each row execute function public.set_updated_at();
