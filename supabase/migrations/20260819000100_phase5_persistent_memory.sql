-- MINHA-AGENDA — Fase 5: memória persistente por usuário.
create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table public.profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  display_name text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(trim(name)) > 0),
  aliases text[] not null default '{}',
  role text,
  class_name text,
  phone text,
  whatsapp_opt_in boolean not null default false,
  last_inbound_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint contacts_id_user_unique unique (id, user_id)
);

create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  amount numeric(12,2) not null check (amount > 0),
  currency char(3) not null default 'BRL',
  category text not null check (char_length(trim(category)) > 0),
  occurred_at timestamptz not null default now(),
  source text not null check (source in ('voice', 'text')),
  metadata jsonb not null default '{}'::jsonb,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint expenses_id_user_unique unique (id, user_id)
);

create table public.reminders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  contact_id uuid,
  title text not null check (char_length(trim(title)) > 0),
  due_at timestamptz not null,
  notification_status text not null default 'pending' check (notification_status in ('pending', 'delivered')),
  metadata jsonb not null default '{}'::jsonb,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint reminders_contact_owner_fkey foreign key (contact_id, user_id) references public.contacts(id, user_id) on delete restrict,
  constraint reminders_id_user_unique unique (id, user_id)
);

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  contact_id uuid,
  title text not null check (char_length(trim(title)) > 0),
  status text not null default 'open' check (status in ('open', 'done')),
  due_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tasks_contact_owner_fkey foreign key (contact_id, user_id) references public.contacts(id, user_id) on delete restrict,
  constraint tasks_id_user_unique unique (id, user_id)
);

create table public.notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  contact_id uuid,
  content text not null check (char_length(trim(content)) > 0),
  metadata jsonb not null default '{}'::jsonb,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint notes_contact_owner_fkey foreign key (contact_id, user_id) references public.contacts(id, user_id) on delete restrict,
  constraint notes_id_user_unique unique (id, user_id)
);

create table public.events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  contact_id uuid,
  title text not null check (char_length(trim(title)) > 0),
  starts_at timestamptz not null,
  ends_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint events_dates_check check (ends_at is null or ends_at >= starts_at),
  constraint events_contact_owner_fkey foreign key (contact_id, user_id) references public.contacts(id, user_id) on delete restrict,
  constraint events_id_user_unique unique (id, user_id)
);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  contact_id uuid,
  channel text not null default 'whatsapp' check (channel = 'whatsapp'),
  recipient_name text not null check (char_length(trim(recipient_name)) > 0),
  body text not null check (char_length(trim(body)) > 0),
  status text not null default 'prepared' check (status in ('prepared', 'mock_sent', 'sent', 'failed')),
  requires_template boolean not null default true,
  provider_message_id text,
  metadata jsonb not null default '{}'::jsonb,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint messages_contact_owner_fkey foreign key (contact_id, user_id) references public.contacts(id, user_id) on delete restrict,
  constraint messages_id_user_unique unique (id, user_id)
);

create table public.action_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  intent text not null,
  entity_type text check (entity_type is null or entity_type in ('contact', 'expense', 'task', 'reminder', 'event', 'note', 'message')),
  entity_id uuid,
  status text not null default 'completed' check (status in ('completed', 'failed', 'undone')),
  summary text not null,
  source text not null check (source in ('voice', 'text')),
  reversible boolean not null default false,
  before_data jsonb,
  after_data jsonb,
  metadata jsonb not null default '{}'::jsonb,
  undone_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint action_logs_id_user_unique unique (id, user_id)
);

create table public.assistant_context (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  recent_conversation jsonb not null default '[]'::jsonb check (jsonb_typeof(recent_conversation) = 'array'),
  pending_question jsonb,
  last_prepared_message_id uuid,
  last_entity_type text,
  last_entity_id uuid,
  last_action_log_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint assistant_context_message_owner_fkey foreign key (last_prepared_message_id, user_id) references public.messages(id, user_id) on delete restrict,
  constraint assistant_context_action_owner_fkey foreign key (last_action_log_id, user_id) references public.action_logs(id, user_id) on delete restrict
);

create table public.ai_usage_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  action_id uuid not null,
  provider text not null check (provider in ('openai', 'local')),
  model text,
  intent text,
  latency_ms integer not null check (latency_ms >= 0),
  result text not null check (result in ('success', 'empty', 'error')),
  error_code text,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  total_tokens integer not null default 0,
  cached_input_tokens integer not null default 0,
  estimated_cost_usd numeric(14,8),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index contacts_user_name_idx on public.contacts (user_id, lower(name)) where deleted_at is null;
create index expenses_user_occurred_idx on public.expenses (user_id, occurred_at desc) where deleted_at is null;
create index reminders_user_due_idx on public.reminders (user_id, due_at) where deleted_at is null;
create index tasks_user_due_idx on public.tasks (user_id, due_at) where deleted_at is null;
create index notes_user_created_idx on public.notes (user_id, created_at desc) where deleted_at is null;
create index events_user_starts_idx on public.events (user_id, starts_at) where deleted_at is null;
create index messages_user_created_idx on public.messages (user_id, created_at desc) where deleted_at is null;
create index action_logs_user_created_idx on public.action_logs (user_id, created_at desc);
create index ai_usage_logs_user_created_idx on public.ai_usage_logs (user_id, created_at desc);

do $$
declare target text;
begin
  foreach target in array array[
    'profiles', 'contacts', 'expenses', 'reminders', 'tasks', 'notes', 'events',
    'messages', 'action_logs', 'assistant_context', 'ai_usage_logs'
  ] loop
    execute format('alter table public.%I enable row level security', target);
    execute format('revoke all on table public.%I from anon', target);
    execute format('grant select, insert, update, delete on table public.%I to authenticated', target);

    execute format('create policy "owner_select" on public.%I for select to authenticated using ((select auth.uid()) = user_id)', target);
    execute format('create policy "owner_insert" on public.%I for insert to authenticated with check ((select auth.uid()) = user_id)', target);
    execute format('create policy "owner_update" on public.%I for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)', target);
    execute format('create policy "owner_delete" on public.%I for delete to authenticated using ((select auth.uid()) = user_id)', target);

    execute format('create trigger set_%I_updated_at before update on public.%I for each row execute function public.set_updated_at()', target, target);
  end loop;
end $$;

create or replace function public.handle_new_user_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (user_id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'name', split_part(coalesce(new.email, ''), '@', 1)))
  on conflict (user_id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user_profile();

insert into public.profiles (user_id, display_name)
select id, coalesce(raw_user_meta_data ->> 'name', split_part(coalesce(email, ''), '@', 1))
from auth.users
on conflict (user_id) do nothing;
