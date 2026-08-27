-- Mantém evidência do resultado no aparelho. Antes, o ACK apagava o handoff e o
-- servidor não conseguia distinguir "código entregue" de "notificação agendada".

alter table public.schedule_handoffs
  add column status text not null default 'awaiting_device',
  add column device_notification_id integer,
  add column acknowledged_at timestamptz,
  add column last_error text,
  add column action_log_id uuid;

alter table public.schedule_handoffs
  add constraint schedule_handoffs_status_check
    check (status in ('awaiting_device', 'scheduled_on_device', 'failed')),
  add constraint schedule_handoffs_notification_id_check
    check (device_notification_id is null or device_notification_id > 0),
  add constraint schedule_handoffs_error_code_check
    check (last_error is null or last_error in ('permission_denied', 'invalid_time', 'schedule_failed')),
  add constraint schedule_handoffs_ack_state_check
    check (
      (status = 'awaiting_device' and acknowledged_at is null and device_notification_id is null and last_error is null)
      or (status = 'scheduled_on_device' and acknowledged_at is not null and device_notification_id is not null and last_error is null)
      or (status = 'failed' and acknowledged_at is not null and device_notification_id is null and last_error is not null)
    ),
  add constraint schedule_handoffs_action_owner_fkey
    foreign key (action_log_id, user_id)
    references public.action_logs(id, user_id)
    on delete cascade;

create index schedule_handoffs_owner_status_idx
  on public.schedule_handoffs (user_id, status, created_at desc);

-- Registros antigos nunca tiveram ACK persistente. Não há evidência para chamar
-- essas ações de concluídas.
alter table public.action_logs drop constraint action_logs_status_check;
alter table public.action_logs
  add constraint action_logs_status_check
  check (status in ('pending', 'completed', 'failed', 'unknown', 'undone'));

update public.action_logs
set status = 'unknown',
    updated_at = now()
where intent = 'schedule_whatsapp_message'
  and status = 'completed';
