-- Aprovações do núcleo agentic ficam no servidor. O cliente recebe apenas o ID;
-- argumentos e continuação do provedor nunca podem ser alterados pelo navegador.

create table public.agent_pending_approvals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null,
  tool_calls jsonb not null check (jsonb_typeof(tool_calls) = 'array'),
  continuation jsonb not null check (jsonb_typeof(continuation) in ('object', 'array')),
  source text not null check (source in ('voice', 'text')),
  timezone text not null check (char_length(trim(timezone)) between 1 and 100),
  status text not null default 'pending' check (status in ('pending', 'processing', 'consumed', 'cancelled', 'failed')),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (expires_at > created_at)
);

create index agent_pending_approvals_owner_status_idx
  on public.agent_pending_approvals (user_id, status, created_at desc);

create index agent_pending_approvals_expires_idx
  on public.agent_pending_approvals (expires_at);

alter table public.agent_pending_approvals enable row level security;
revoke all on table public.agent_pending_approvals from anon, authenticated;
grant all on table public.agent_pending_approvals to service_role;

-- Sem policies de cliente: somente o service role das rotas do servidor acessa
-- argumentos aprováveis e o estado opaco do provedor.
