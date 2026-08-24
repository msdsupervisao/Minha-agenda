# Fase 7 — PWA e notificações push

## Entrega

- manifesto PWA, ícones e service worker;
- inscrição Web Push por aparelho em `/ajustes`;
- chaves VAPID validadas no cliente;
- persistência das inscrições em `push_subscriptions` com RLS;
- envio de teste autenticado;
- rota protegida `/api/cron/reminders` para processar lembretes vencidos;
- remoção automática de inscrições expiradas e marcação `notified_at`.

O segredo do cron é aceito somente pelos headers `x-cron-secret` ou `Authorization: Bearer`. A comparação é resistente a diferenças de tempo e o segredo não é aceito na URL.

## Configuração

São necessárias as variáveis `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, `SUPABASE_SECRET_KEY` e `CRON_SECRET`, além da migration `20260821000300_phase7_push.sql`.

## Validação pendente

Os testes automatizados cobrem payload, VAPID, autorização do cron, erros de inscrição e migration. A conclusão operacional depende de:

1. manter um agendador externo chamando a rota do cron;
2. criar um lembrete com vencimento próximo;
3. confirmar a entrega com o PWA fechado em um aparelho Android real.

O script local `scripts/push-test.mjs` auxilia essa validação, mas executa operações reais no Supabase e no endpoint de produção.
