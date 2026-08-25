-- MINHA-AGENDA — Fase 8: handoff de agendamento para o app Android (Capacitor).
-- O site cria a mensagem+horário e gera um CÓDIGO TEMPORÁRIO de uso único.
-- O app troca esse código pela mensagem via /api/schedule/redeem (service role),
-- confirma o agendamento via /api/schedule/ack e então o registro é apagado.
-- O banco guarda somente SHA-256 do código; a mensagem não vai no deep link.
-- Depende de pgcrypto (criado na fase 5).

create table public.schedule_handoffs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  code_hash text not null unique check (code_hash ~ '^[0-9a-f]{64}$'),
  body text not null check (char_length(body) between 1 and 4000),
  recipient_name text check (recipient_name is null or char_length(recipient_name) <= 200),
  phone text check (phone is null or char_length(phone) <= 40),
  due_at timestamptz not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  check (due_at > created_at),
  check (expires_at > created_at)
);

create index schedule_handoffs_user_idx on public.schedule_handoffs (user_id);
-- Busca do redeem é por code_hash (unique já indexa); o cron limpa expires_at.
create index schedule_handoffs_expires_idx on public.schedule_handoffs (expires_at);

alter table public.schedule_handoffs enable row level security;
revoke all on table public.schedule_handoffs from anon;
grant select, insert, delete on table public.schedule_handoffs to authenticated;

-- Dono (site logado) cria e lê os próprios códigos. O REDEEM roda por service role
-- (ignora RLS), então o app anônimo NÃO precisa de policy — o próprio código, curto e
-- de uso único, é a credencial.
create policy "owner_select" on public.schedule_handoffs for select to authenticated using ((select auth.uid()) = user_id);
create policy "owner_insert" on public.schedule_handoffs for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "owner_delete" on public.schedule_handoffs for delete to authenticated using ((select auth.uid()) = user_id);
