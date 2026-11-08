-- Separates the user's completion state from notification delivery.
alter table public.reminders
  add column if not exists completed_at timestamptz;

create index if not exists reminders_user_completed_idx
  on public.reminders (user_id, completed_at)
  where deleted_at is null;
