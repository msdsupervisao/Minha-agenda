# Plano — notificações por item, fuso do usuário e canais

## Summary

Implementar os tickets 1–5 da proposta: propagar o fuso real do dispositivo para o servidor e persistir a preferência por usuário; criar o primeiro fluxo de notificações para eventos com antecedência; estender o mesmo motor para tarefas; permitir múltiplas antecedências; e adicionar despacho opcional por WhatsApp com fallback para push. O ticket 6 fica fora desta rodada.

## Context

- `components/TimezoneSync.tsx` já calcula `Intl.DateTimeFormat().resolvedOptions().timeZone` e grava o cookie `tz`.
- `lib/data/server-timezone.ts` já lê o cookie, mas não oferece contexto assíncrono e o valor não é persistido por usuário; um cron externo não tem o cookie do celular.
- `app/api/cron/reminders/route.ts` hoje consulta apenas `reminders`, dispara apenas push no `due_at` e usa `notified_at` como dedupe.
- `reminders`, `tasks` e `events` já possuem `metadata jsonb`, o que permite armazenar `alerts` e `channels` sem alterar o modelo principal dos itens.
- `AgendaView` e `app/agenda/actions.ts` já possuem edição por tipo; serão estendidos para editar antecedências e canais.
- O push existente está em `lib/push/send.ts`, `lib/push/pure.ts` e `push_subscriptions`.
- A integração WhatsApp existente (`lib/assistant/whatsapp-cloud.ts`) conhece opt-in e a janela de 24 horas, mas está acoplada ao repositório de memória e só envia texto livre. O dispatcher novo vai reutilizar suas regras/serviço e acrescentar o caminho de template para notificações.
- A versão instalada é Next 16.3.2; cookies são assíncronos e a entrada global é `proxy.ts`, não `middleware.ts`.

## System Impact

- Fonte de verdade do fuso: cookie para a requisição atual, contexto assíncrono para código server-side encadeado e `profiles.metadata.timezone` para jobs sem cookie, especialmente o cron.
- Fonte de verdade das configurações de notificação: `metadata.alerts` (minutos antes) e `metadata.channels` (`push`/`whatsapp`) no próprio item.
- Fonte de verdade da idempotência: tabela `notification_deliveries`, com `dedupe_key` único por item, ocorrência, antecedência e canal.
- `reminders.notified_at` permanece para compatibilidade com a Fase 7; o novo motor passa a governar a entrega por `dedupe_key`.
- Itens elegíveis: reminders ativos; events ativos; tasks ativos, abertos e com `due_at`. Itens apagados, tarefas concluídas e tarefas sem prazo são ignorados.
- Reagendamento e recorrência geram novas chaves por horário-âncora, sem reaproveitar entregas de uma ocorrência anterior.
- Falha ou indisponibilidade do WhatsApp não impede push quando push estiver configurado.

## Approach

1. Criar um contexto de timezone baseado em `AsyncLocalStorage`, com validação IANA e fallback para `APP_TIMEZONE`.
2. Fazer `TimezoneSync` sincronizar o cookie e persistir o timezone autenticado por uma rota pequena; manter a persistência best-effort para não bloquear a UI.
3. Criar um motor puro em `lib/notifications/schedule.ts` que expande offsets × canais e calcula `fireAt` em UTC, sem depender de banco ou rede.
4. Criar `collect.ts` para normalizar os três schemas e carregar preferências persistidas de timezone/canais quando necessário.
5. Criar migration para `notification_deliveries`, índices e metadados de perfil; adaptar o cron para reservar/registrar entregas de forma idempotente.
6. Criar dispatcher uniforme para push e WhatsApp. WhatsApp respeita contato, telefone, opt-in e janela de 24h; fora dela usa template configurado, e falhas permitem fallback para push.
7. Estender actions/UI da agenda para controlar uma antecedência simples inicialmente, depois lista de múltiplas antecedências e canais.

## Changes

- `lib/data/server-timezone.ts` — contexto ALS, leitura do cookie, leitura/persistência do perfil e helpers para executar código com timezone.
- `components/TimezoneSync.tsx` — sincronização validada do cookie e chamada best-effort para persistir o fuso autenticado.
- `app/api/timezone/route.ts` — endpoint autenticado para salvar `profiles.metadata.timezone`.
- `supabase/migrations/*_notification_timezone.sql` — timezone no perfil, `notification_deliveries`, RLS/service-role access, índices e constraints.
- `lib/notifications/schedule.ts` — tipos e cálculo puro dos avisos devidos.
- `lib/notifications/collect.ts` — coleta/normalização de reminders, events e tasks elegíveis.
- `lib/notifications/dispatch.ts` — payload e despacho uniforme por canal, incluindo fallback e resultado observável.
- `lib/push/pure.ts` — payloads para evento/tarefa e tags deduplicáveis.
- `app/api/cron/reminders/route.ts` — coleta do novo motor, reserva idempotente, entrega por canal, limpeza de inscrições expiradas e contadores por canal.
- `lib/assistant/whatsapp-cloud.ts` — suporte ao envio de template/tempo de referência sem quebrar o fluxo existente.
- `app/agenda/actions.ts` — validação e persistência de `alerts`/`channels`, incluindo remoção de configurações quando necessário.
- `lib/data/agenda.ts`, `lib/data/supabase-memory-repository.ts` e `lib/assistant/types.ts` — transporte tipado dos metadados de notificação.
- `components/screens/AgendaView.tsx` e `components/screens/Screens.module.css` — controles de antecedência e canal por item.
- `public/sw.js` — suporte aos novos payloads sem alterar a navegação existente.
- `tests/notifications-schedule.test.ts`, `tests/notifications-collect.test.ts`, `tests/notifications-dispatch.test.ts`, `tests/fase7-push.test.ts` — cobertura unitária e de orquestração/fallback.

## Verification

- `npm run typecheck`
- `npm run lint`
- `npm test`
- Casos obrigatórios: fusos diferentes, DST, evento com 1 hora, múltiplos offsets, tarefa concluída/sem prazo, repetição do cron sem duplicata, push `gone`, WhatsApp sem opt-in, WhatsApp dentro/fora da janela de 24h, fallback para push e reagendamento.
- Inspeção da migration e dos contratos de retorno do cron.
- Validação manual opcional: criar evento para poucos minutos no futuro, ativar push e chamar o cron autorizado.

