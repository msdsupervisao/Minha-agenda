# Spec — Notificações de lembrete para eventos e tarefas

> Status: `ready-for-agent` (rascunho local — publicar no tracker depois de `/setup-matt-pocock-skills`)
> Projeto: Minha-agenda · © 2026 Fernando Padova

## Problem Statement

Hoje a Minha-agenda só avisa o usuário sobre itens da tabela `reminders`, e mesmo
assim o aviso cai exatamente no `due_at`, por Web Push, sem antecedência. Na prática:

- **Eventos** (`events`, com `starts_at`) e **tarefas** (`tasks`, com `due_at`) não
  geram nenhum aviso — o usuário marca um compromisso ou uma tarefa na agenda e nunca
  é lembrado dela.
- Mesmo para `reminders`, não há "me avise 1 hora antes": o push só dispara na hora
  cheia, quando muitas vezes já é tarde para o usuário reagir.
- O único canal é o Web Push (PWA). Quando o celular está com o app fechado, DNS
  privado/VPN ativo ou o serviço do Google Play instável, o aviso simplesmente não
  chega, e o usuário não tem um canal alternativo confiável.
- Os horários dependem de `APP_TIMEZONE`, que está chumbado e não acompanha o fuso do
  celular. Um aviso calculado no fuso errado cai na hora errada — o que destrói a
  confiança no recurso inteiro.

## Solution

Transformar o motor de lembretes existente (Fase 7: VAPID, `public/sw.js`,
`/api/cron/reminders`, `push_subscriptions`) num motor de **notificações
multi-item, multi-aviso e multi-canal**, com os horários calculados no fuso correto
do usuário:

1. **Eventos e tarefas passam a notificar**, além dos `reminders` que já notificam.
2. **Múltiplos avisos por item**: cada item pode disparar em mais de uma antecedência
   (ex.: 1 dia antes + 1 hora antes), configuradas por item.
3. **WhatsApp** entra como canal de entrega, reaproveitando a base já existente
   (`whatsapp-cloud` / `schedule_handoffs`), convivendo com o Web Push atual.
4. **Correção de fuso** incluída no escopo: o horário do disparo passa a ser calculado
   no fuso real do usuário (plano já desenhado: cookie `tz` + `AsyncLocalStorage`),
   para o aviso cair na hora local certa.

Do ponto de vista do usuário: ele cria um evento ou uma tarefa, escolhe quando quer
ser avisado (uma ou mais antecedências), escolhe por onde (push e/ou WhatsApp), e
recebe o aviso no horário certo do seu fuso.

## User Stories

1. Como usuário da Minha-agenda, quero que meus **eventos** me avisem antes de
   começarem, para não perder compromissos que marquei na agenda.
2. Como usuário, quero que minhas **tarefas com prazo** me avisem antes do vencimento,
   para conseguir concluí-las a tempo.
3. Como usuário, quero continuar recebendo avisos dos meus **lembretes** (`reminders`)
   como já recebo hoje, sem regressão.
4. Como usuário, quero definir **quando** ser avisado de cada item (na hora, 15 min,
   1 h, 1 dia antes), para que o aviso chegue no momento em que ele me é útil.
5. Como usuário, quero poder configurar **mais de um aviso** para o mesmo item
   (ex.: 1 dia antes e 1 hora antes), para itens importantes que exigem preparo.
6. Como usuário, quero receber o lembrete pelo **WhatsApp**, para ser avisado mesmo
   com o app fechado ou sem abrir o PWA.
7. Como usuário, quero continuar recebendo **Web Push** no celular, para ter um canal
   gratuito e imediato quando o app está instalado.
8. Como usuário com itens em canais diferentes, quero escolher **por qual canal**
   (push, WhatsApp, ou ambos) cada item me avisa, para não ser incomodado em excesso.
9. Como usuário que viaja ou mudou de fuso, quero que os avisos caiam no **meu horário
   local atual**, para o lembrete não chegar horas adiantado ou atrasado.
10. Como usuário, quero que um item com **vários avisos** não me mande o mesmo aviso
    duas vezes, para não receber notificações duplicadas.
11. Como usuário, quero que avisos de itens **recorrentes** (diário/semanal/mensal)
    continuem funcionando com a antecedência configurada, para manter rotinas.
12. Como usuário, quero que, ao **concluir** uma tarefa ou **apagar** um evento antes
    da hora, os avisos pendentes dele **não** sejam mais enviados.
13. Como usuário, quero que **reagendar** um evento/tarefa recalcule automaticamente os
    horários dos avisos, para não receber aviso de um horário antigo.
14. Como usuário, quero **clicar na notificação** e ser levado direto ao item na agenda,
    como já acontece hoje com o push.
15. Como usuário sem WhatsApp configurado, quero que o item ainda me avise por **push**,
    para não ficar sem nenhum aviso por causa de um canal indisponível.
16. Como usuário, quero que, se um canal falhar (ex.: inscrição de push expirada),
    o sistema tente o **outro canal** quando configurado, para aumentar a entrega.
17. Como usuário, quero que avisos **no passado** (item criado para daqui a 5 min com
    aviso "1 dia antes") sejam tratados com bom senso — ou disparam já, ou são
    ignorados —, sem travar o processamento.
18. Como dono do sistema, quero que o cron processe os avisos devidos de forma
    **idempotente**, para rodar várias vezes sem reenviar o que já foi enviado.
19. Como dono do sistema, quero **observabilidade** (quantos checados/enviados/falhos
    por canal) no retorno do cron, para diagnosticar entregas.
20. Como dono do sistema, quero que inscrições de push mortas sejam **removidas**
    automaticamente ao retornarem "gone", como já ocorre hoje.
21. Como usuário, quero me cadastrar como **contato com opt-in** para que meus próprios
    lembretes cheguem no meu WhatsApp, respeitando a regra de consentimento.
22. Como dono do sistema, quero que itens cujo contato **não deu opt-in** (ou não tem
    telefone) **não** disparem WhatsApp e caiam no push, para nunca mandar mensagem
    sem permissão e evitar bloqueio do número pela Meta.
23. Como usuário, quero que, quando o lembrete cai **fora da janela de 24h** do WhatsApp,
    ele chegue mesmo assim via **mensagem de template** aprovada, para não ficar sem aviso.
24. Como dono do sistema, quero que, se o WhatsApp não puder enviar (mock desligado,
    sem template aprovado, sem opt-in), o item ainda tente o **push**, para não perder
    o aviso por causa de um canal indisponível.

## Implementation Decisions

### Modelo de dados
- **Antecedências (lead times) por item**: representadas em `metadata.alerts` como uma
  lista de offsets em minutos antes do horário-âncora (ex.: `{ "alerts": [1440, 60] }`).
  Vale para `reminders`, `events` e `tasks`. Ausência de `alerts` mantém o
  comportamento atual (disparo na hora cheia) para `reminders`.
- **Horário-âncora por tipo**: `reminders.due_at`, `events.starts_at`, `tasks.due_at`.
  Tarefas sem `due_at` ou com `status = 'done'` nunca entram na fila de avisos.
- **Canais por item**: `metadata.channels` (ex.: `["push","whatsapp"]`). Default quando
  ausente: `["push"]`, preservando o comportamento atual.
- **Controle de "já disparado" por aviso**: como cada item tem N avisos, não basta o
  `reminders.notified_at` único. Decisão: tabela `notification_deliveries`
  (`item_type`, `item_id`, `user_id`, `fire_at`, `channel`, `status`, `sent_at`,
  `dedupe_key` único) marcando cada (item, offset, canal) já entregue. O
  `reminders.notified_at` existente é mantido para não quebrar a Fase 7, mas a
  idempotência passa a ser governada pelo `dedupe_key`.

### Módulos a construir/modificar
- **`lib/notifications/schedule.ts` (novo, puro)** — núcleo da feature. Dado um item
  notificável normalizado, a lista de offsets, o fuso do usuário e o `now`, produz os
  disparos devidos ainda não entregues. Espelha o padrão de `lib/assistant/recurrence.ts`
  e `lib/push/pure.ts`. Shape da decisão (derivado da modelagem, não é código final):

  ```ts
  type NotifiableItem = {
    itemType: 'reminder' | 'event' | 'task';
    id: string;
    userId: string;
    anchorIso: string;          // due_at | starts_at
    alerts: number[];           // offsets em minutos (pode ser vazio)
    channels: ('push' | 'whatsapp')[];
  };

  type DueNotification = {
    itemType: NotifiableItem['itemType'];
    itemId: string;
    userId: string;
    channel: 'push' | 'whatsapp';
    fireAt: string;             // instante do disparo (anchor - offset)
    dedupeKey: string;          // `${itemType}:${id}:${offset}:${channel}`
  };

  // Puro: expande offsets × canais, filtra os já no passado da janela e
  // calcula fireAt no fuso do usuário; o chamador remove os com dedupeKey já entregue.
  function dueNotifications(item: NotifiableItem, tz: string, now: Date): DueNotification[];
  ```

- **`lib/notifications/collect.ts` (novo)** — lê `reminders` + `events` + `tasks`
  elegíveis do Supabase e os normaliza em `NotifiableItem[]`. Única camada que conhece
  os três schemas; mantém o resto do pipeline agnóstico ao tipo.
- **`/api/cron/reminders/route.ts` (modificar)** — passa a: coletar via `collect`,
  calcular devidos via `schedule`, descartar `dedupeKey` já presentes em
  `notification_deliveries`, despachar por canal e registrar a entrega. Mantém a limpeza
  de `schedule_handoffs`/`agent_pending_approvals` e a lógica de recorrência já existente.
  (Pode ser renomeado para `/api/cron/notifications` com alias, decisão de implementação.)
- **`lib/notifications/dispatch.ts` (novo)** — `sendNotification(channel, payload, target)`
  que roteia para `lib/push/send.ts` (push) e para o envio WhatsApp existente. Retorna
  resultado uniforme (`ok`, `gone`, `error`) para o cron agir (remover inscrição morta,
  tentar canal alternativo).
- **Canal WhatsApp** — reaproveitar a infra já coberta por `tests/whatsapp-cloud.test.ts`
  e o mecanismo de `schedule_handoffs`. Para avisos ao próprio usuário, usar a via já
  existente; não introduzir servidor novo nesta spec além do que já há. Hoje o canal
  está em **modo mock** (Ajustes: "Desativado (mock)") — ligar o modo real exige
  configurar `WHATSAPP_MODE=cloud` + `WHATSAPP_ACCESS_TOKEN` + `WHATSAPP_PHONE_NUMBER_ID`
  + `WHATSAPP_VERIFY_TOKEN` (conta WhatsApp Business/Cloud API da Meta).
- **Destinatário e opt-in (WhatsApp)** — o número de destino **não é inferido**: vem de
  um `contact` com `phone` cadastrado e `whatsappOptIn = true`. A regra já existe em
  `whatsappSendAllowed` (`lib/assistant/whatsapp-cloud.ts`) e deve ser respeitada: sem
  contato, sem telefone ou sem opt-in, o canal WhatsApp é **pulado** para aquele item
  (cai no push, se configurado). Para o próprio usuário receber, ele precisa estar
  cadastrado como contato com opt-in.
- **Janela de 24h / templates (WhatsApp)** — restrição da Cloud API da Meta: envio de
  **texto livre só dentro de 24h** desde a última mensagem recebida do destinatário.
  Como lembretes são agendados para o futuro, o disparo quase sempre cai **fora** dessa
  janela, exigindo **mensagem de template pré-aprovada** pela Meta (com variáveis para
  título e horário do item). Decisão: o `dispatch` do canal WhatsApp detecta a janela e
  escolhe texto-livre vs. template; a aprovação do(s) template(s) na Meta é
  pré-requisito operacional (ver Further Notes). Sem template aprovado, o item cai no
  push.
- **Fuso horário** — implementar o plano já desenhado (cookie `tz` definido no cliente +
  leitura via `AsyncLocalStorage` no servidor) e passar o `tz` resultante para
  `dueNotifications`. Esta é a origem única de verdade do fuso; remove a dependência do
  `APP_TIMEZONE` chumbado para fins de cálculo de disparo.
- **UI** — estender o formulário de evento/tarefa/lembrete para editar `alerts` e
  `channels`. `components/PushToggle.tsx` e `RegisterSW.tsx` permanecem como estão.

### Contratos / interações
- O cron continua autorizado por `isCronAuthorized` e exige `serviceConfigured()`;
  passa a exigir configuração do canal que for usado (push via `pushConfigured()`,
  WhatsApp via sua própria checagem) e degrada por canal, não globalmente.
- O retorno do cron ganha contagem por canal: `{ checked, sent: {push, whatsapp},
  failed: {push, whatsapp}, ... }`.
- Recorrência: ao reagendar a próxima ocorrência, as entregas (`dedupe_key`) da
  ocorrência anterior deixam de valer para a nova `fire_at` (chave inclui o offset e o
  horário-âncora da ocorrência).

## Testing Decisions

- **O que é um bom teste aqui**: exercita comportamento externo (dado um conjunto de
  itens + fuso + `now`, quais avisos são devidos e por quais canais), não detalhes de
  implementação. A seam pura permite tabelas de casos sem tocar em DB nem rede.
- **Seam principal (`lib/notifications/schedule.ts`)** — testes unitários cobrindo:
  múltiplos offsets por item; conversão de fuso (mesmo instante UTC gera `fireAt` local
  correto em fusos diferentes); avisos no passado; item sem `alerts`; tarefa `done`/sem
  `due_at` excluída; dedupe por `dedupeKey`; expansão offset × canais. Prior art direto:
  `tests/recurrence.test.ts` e `tests/push-independent.test.ts`.
- **Seam de orquestração (cron)** — testes de integração com **Supabase fake** e
  **sender fake**, verificando: processa só o que é devido, registra entrega, não
  reenvia em segunda execução (idempotência), remove inscrição `gone`, e conta por
  canal. Prior art: `tests/fase7-push.test.ts`.
- **Seam de canal (`dispatch`)** — teste com fakes garantindo roteamento correto por
  canal e fallback quando um canal falha. Cobrir também: contato **sem opt-in/sem
  telefone** → WhatsApp pulado e push tentado; disparo **dentro** da janela de 24h →
  texto livre; **fora** da janela → template; mock desligado → fallback para push.
  Prior art: `tests/whatsapp-cloud.test.ts`, `tests/whatsapp-handoff.test.ts`.
- **Módulos testados**: `schedule`, `collect` (normalização dos três tipos), rota do
  cron, `dispatch`. UI de configuração de `alerts`/`channels` fica em teste leve de
  formulário (prior art: `tests/fase6-screens.test.ts`), sem e2e.

## Out of Scope

- Novo servidor/infra de WhatsApp além do que já existe (`whatsapp-cloud`/handoff);
  envio para **grupos** do WhatsApp continua fora.
- Canal de **e-mail** (não foi escolhido nesta entrega).
- **Snooze/ações** na notificação (adiar/concluir pelo próprio push).
- Reescrita do service worker além do necessário para os novos payloads.
- Preferências globais de "não perturbe"/horário de silêncio.
- Migração de `reminders.notified_at` para fora do schema (mantido por compatibilidade).

## Further Notes

- **Risco central = fuso.** Por isso entrou no escopo. O cálculo de `fireAt` deve usar
  exclusivamente o `tz` do usuário (cookie/ALS), nunca `APP_TIMEZONE`. Testar fusos
  distintos é obrigatório antes de considerar a feature pronta.
- **Compatibilidade Fase 7**: itens `reminders` sem `metadata.alerts`/`channels` devem
  se comportar exatamente como hoje (push na hora cheia). Nenhuma regressão no fluxo
  atual é aceitável.
- **Agendamento do cron**: não há `vercel.json` no repo — confirmar como o
  `/api/cron/reminders` é disparado hoje (cron externo?) e garantir cadência ≤ 1 min
  para que antecedências curtas (ex.: 15 min) caiam com precisão aceitável.
- **Pré-requisitos operacionais do WhatsApp** (fora do código, mas bloqueiam a entrega):
  1. Conta **WhatsApp Business / Cloud API** na Meta e as 4 variáveis configuradas
     (`WHATSAPP_MODE=cloud` + access token + phone number id + verify token).
  2. Sair do **modo mock** ("Desativado (mock)" em Ajustes).
  3. **Template(s)** de lembrete aprovado(s) pela Meta, com variáveis para título e
     horário — sem isso, avisos fora da janela de 24h não saem por WhatsApp.
  4. O usuário cadastrado como **contato com `phone` + opt-in** para receber os próprios
     avisos. Enquanto esses pré-requisitos não existirem, o WhatsApp fica indisponível e
     o push é o único canal — sem erro para o usuário.
- **Divisão Claude/Codex**: pela regra do projeto, o núcleo técnico (schema, rota do
  cron, dispatch, lib) é território do Codex; não editar `app/`, `lib/`, `components/`,
  `mobile/`, `supabase/` sem alinhamento. Esta spec é o documento de handoff.
