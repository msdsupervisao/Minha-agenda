-- Adiciona 'telegram' como canal válido em notification_deliveries.
-- O CHECK anterior aceitava só 'push' e 'whatsapp'; precisamos recriá-lo.
alter table public.notification_deliveries
  drop constraint if exists notification_deliveries_channel_check;

alter table public.notification_deliveries
  add constraint notification_deliveries_channel_check
  check (channel in ('push', 'whatsapp', 'telegram'));
