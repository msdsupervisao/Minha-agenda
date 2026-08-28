# Handoff — Novo núcleo agentic e correção do agendamento

Data do handoff: **27 de agosto de 2026**
Projeto: `F:\PROJETOS\Minha-agenda`
Estado: implementação local concluída, validada e **ainda não publicada/ativada**.

## 1. Objetivo do projeto

Transformar o Minha Agenda de um reconhecedor de comandos rígidos em um assistente
pessoal agentic, no qual o usuário fala naturalmente e o sistema executa o ciclo:

```text
intenção
↓
contexto e memória
↓
raciocínio do LLM
↓
seleção de ferramenta
↓
execução
↓
verificação por evidência
↓
resposta curta e honesta
```

Regras fundamentais:

- não usar frases exatas, palavras-chave ou regex como roteador de intenção;
- não inventar arquivos, pessoas, turmas, grupos, horários ou resultados;
- resolver entidades contra dados reais;
- confirmar ações externas, destrutivas e críticas;
- nunca declarar sucesso apenas porque uma chamada foi disparada;
- manter provedor de LLM, ferramentas, políticas, memória e interface desacoplados.

## 2. Incidente que motivou a mudança

O usuário tentou agendar o modelo 2 de uma turma de Design Gráfico. O sistema antigo:

- interpretava solicitações por intents fixas e regras locais;
- podia aceitar uma transcrição como `aqueles tecnologia` sem validar um grupo real;
- criava apenas um handoff para o aplicativo Android;
- mostrava `aguardando confirmação no celular`, mas não conservava evidência de que o
  aparelho realmente havia criado a notificação;
- exigia outra confirmação dentro do aplicativo;
- não avisava corretamente quando o processo não era concluído.

O ACK antigo apagava o registro de `schedule_handoffs`. Depois disso, o servidor não
conseguia distinguir `handoff transferido` de `notificação realmente agendada`.

## 3. Divisão do trabalho

### Lane Claude

O Claude produziu somente os arquivos autorizados:

- `docs/claude-arquitetura-conversacional.md`
- `tests/fixtures/agent-conversations.pt-BR.json`

Entregas:

- arquitetura de contexto multi-turno;
- memória curta, operacional e longa;
- autorização e privacidade;
- matriz de risco;
- tratamento de ambiguidades, erros de STT, interrupções e correções;
- persona e esqueleto de prompt;
- 76 cenários de avaliação em pt-BR cobrindo 26 ferramentas conceituais.

Esses dois arquivos foram lidos e integrados, mas **não foram alterados pelo Codex**.

### Lane Codex

O Codex ficou responsável pela implementação:

- contratos e orquestrador agentic;
- abstração de provedor;
- tool calling;
- política de confirmação;
- verificação de resultados;
- contexto e memória operacional;
- ferramentas reais de turmas/modelos/agendamento;
- aprovação persistente no servidor;
- integração da interface atrás de feature flag;
- correção do protocolo Android;
- migrations e testes.

## 4. Arquitetura agentic implementada

Arquivos principais:

```text
lib/agent/
├── contracts.ts
├── orchestrator.ts
├── tool-registry.ts
├── approval-policy.ts
├── verifier.ts
├── context-builder.ts
├── pending-approval-store.ts
├── server-agent.ts
├── client.ts
├── eval-fixture.ts
├── eval-tool-compatibility.ts
├── providers/
│   └── openai-responses.ts
└── tools/
    ├── classes.ts
    └── notice-schedule.ts
```

### Fluxo do orquestrador

```text
mensagem natural
↓
contexto recente + resumo + foco + memórias
↓
provedor LLM
↓
tool call estruturado
↓
validação Zod
↓
política de risco
↓
aprovação, quando necessária
↓
execução
↓
verificador
↓
resultado volta ao LLM
↓
resposta final
```

Características:

- limite de etapas por execução;
- contratos JSON independentes de provedor;
- schemas estritos de ferramentas;
- nenhuma ferramenta desconhecida é executada;
- ações com efeito precisam de verificador explícito;
- ferramentas de leitura usam o retorno da fonte como evidência;
- falso `Pronto` após falha ou resultado não verificado é bloqueado;
- uso de tokens é acumulado entre etapas;
- contexto fornecido ao LLM é marcado como dado não confiável, não como instrução.

## 5. Provedor OpenAI

Foi criado um adaptador para a Responses API em:

```text
lib/agent/providers/openai-responses.ts
```

Ele:

- publica ferramentas com JSON Schema estrito;
- desativa chamadas paralelas nesta fase;
- preserva itens de raciocínio e function calls entre etapas;
- associa resultados pelo `call_id`;
- usa `store: false`;
- possui timeout e contabilização de tokens;
- não expõe detalhes específicos da OpenAI ao restante do núcleo.

O restante do agente depende da interface `AgentProvider`, permitindo outro provedor no
futuro.

## 6. Contexto e memória

Nova tabela:

```text
agent_contexts
```

Migration:

```text
supabase/migrations/20260826000800_agent_contexts.sql
```

Ela separa:

- turnos recentes;
- resumo progressivo, ainda não gerado automaticamente;
- foco atual;
- memória operacional baseada em observações de ferramentas;
- memória de longo prazo, ainda sem ferramentas de gravação/remoção.

O contexto usa orçamento estimado de tokens, não apenas uma quantidade fixa de turnos.
As observações persistidas têm o contrato:

```text
ferramenta + argumentos + resultado + sucesso + verificação + evidência
```

Códigos temporários, deep links, intents Android, tokens e secrets são removidos antes
da persistência.

## 7. Ferramentas reais disponíveis no piloto

### `find_classes`

- consulta somente turmas reais do usuário;
- pesquisa nome, curso e grupo;
- devolve candidatos e pontuação;
- classifica o resultado como `none`, `ambiguous` ou `likely_single`;
- similaridade serve apenas para resolver entidades depois que o LLM escolheu a
  ferramenta; não é roteamento de intenção.

### `get_notice_template`

- recebe UUID real da turma;
- aceita somente modelos 1, 2 ou 3;
- devolve o texto salvo e o destinatário cadastrado;
- nunca fabrica turma ou conteúdo ausente.

### `prepare_notice_schedule`

- exige confirmação;
- recebe turma, modelo, destinatário, corpo e horário;
- relê a turma e o modelo antes de executar;
- recusa corpo ou destinatário diferentes da fonte real;
- recusa horário passado;
- cria somente um handoff em `awaiting_device`;
- não afirma que o celular já agendou.

### `get_schedule_status`

- consulta o handoff pelo UUID;
- diferencia `awaiting_device`, `scheduled_on_device` e `failed`;
- deve ser usado antes de responder se o aparelho realmente agendou.

## 8. Aprovação segura

Nova tabela privada:

```text
agent_pending_approvals
```

Migration:

```text
supabase/migrations/20260826000700_agent_pending_approvals.sql
```

Decisões de segurança:

- argumentos e continuação do provedor ficam no servidor;
- o navegador recebe somente um UUID temporário;
- cliente `anon` e `authenticated` não têm acesso direto à tabela;
- somente `service_role` acessa os registros;
- aprovação expira em 15 minutos;
- confirmação executa exatamente os tool calls persistidos;
- IDs aprovados não autorizam chamadas diferentes;
- solicitações repetidas não reutilizam aprovação consumida;
- confirmações expiradas, canceladas ou já usadas são recusadas.

Rota:

```text
app/api/agent/turn/route.ts
```

## 9. Correção do protocolo de agendamento Android

Migration:

```text
supabase/migrations/20260826000600_schedule_handoff_delivery_state.sql
```

Estados agora persistidos:

```text
awaiting_device
scheduled_on_device
failed
```

Também são guardados:

- ID da notificação no aparelho;
- instante do ACK;
- código de erro;
- vínculo opcional com o action log legado;
- prazo curto de auditoria.

Mudanças no protocolo:

1. O site confirma destinatário, corpo, data, horário e fuso.
2. O servidor cria o handoff e retorna:
   - custom deep link;
   - Android Intent mais confiável;
   - UUID consultável do handoff.
3. Ao abrir pelo link, o app agenda automaticamente.
4. O mesmo código gera sempre o mesmo ID de notificação, evitando duplicações em retry.
5. O app tenta enviar o ACK três vezes.
6. O ACK atualiza o registro; não o apaga.
7. O site consulta `/api/schedule/status`.
8. Somente `scheduled_on_device` permite mostrar `Agendamento confirmado no celular`.
9. Permissão negada, horário vencido e falha nativa ficam visíveis.

Arquivos relevantes:

```text
app/api/schedule/create/route.ts
app/api/schedule/redeem/route.ts
app/api/schedule/ack/route.ts
app/api/schedule/status/route.ts
lib/schedule/handoff.ts
lib/schedule/notification-id.ts
mobile/src/main.ts
components/AssistantHub.tsx
```

### Limitação inevitável do WhatsApp

No horário, o Android pode mostrar a notificação. O aplicativo não deve abrir ou enviar
uma mensagem de WhatsApp silenciosamente em segundo plano.

O fluxo correto continua sendo:

```text
notificação
↓
usuário toca
↓
WhatsApp abre ou mostra compartilhamento
↓
usuário escolhe/confirma o destino
↓
usuário envia
```

Nunca usar a palavra `entregue` apenas porque o WhatsApp foi aberto.

## 10. Integração da interface

O `AssistantHub` usa o novo agente somente quando:

```text
AGENT_V1_ENABLED=true
```

A flag permanece em:

```text
AGENT_V1_ENABLED=false
```

no `.env.example`.

Com a flag desligada, o fluxo antigo continua funcionando. Com a flag ligada e usuário
autenticado no Supabase, a página usa `/api/agent/turn`, mostra confirmações do novo
agente, abre o aplicativo e acompanha o ACK.

## 11. Fixture e avaliação do Claude

Foi criado um validador Zod para:

```text
tests/fixtures/agent-conversations.pt-BR.json
```

Validações automáticas:

- no mínimo 60 casos;
- IDs únicos;
- ferramentas usadas precisam estar declaradas;
- ferramentas declaradas precisam aparecer em pelo menos um cenário;
- estrutura completa de objetivo, argumentos, confirmação, pergunta, proibições e
  evidência.

Auditoria confirmada:

```text
76 casos
76 IDs únicos
26 ferramentas declaradas
26 ferramentas cobertas
24 categorias
```

Mapeamento conceitual → runtime:

```text
resolve_recipient          → find_classes
load_notice_model          → get_notice_template
schedule_whatsapp_message  → prepare_notice_schedule + get_schedule_status
financial_action           → bloqueada intencionalmente
demais ferramentas         → planejadas
```

Incompatibilidades registradas sem editar o material do Claude:

1. O documento menciona 68 casos, mas o JSON possui 76.
2. `mem-56` a `mem-59` exigem mutação de memória com `ferramentas: []`.
3. `read-68` usa `search_files` para consultar agenda, embora precise de ferramenta de
   domínio.
4. `msg-tecnologia-ambiguo-34` aceita resolver ou perguntar, mas codifica as duas
   expectativas simultaneamente.

Esses pontos estão em:

```text
lib/agent/eval-tool-compatibility.ts
```

## 12. Proteção do incidente real

Existem testes específicos para:

- `aqueles tecnologia` nunca virar grupo real;
- erro de STT recuperar `Kids Tecnologia` apenas como candidato;
- resultado incerto obrigar pergunta;
- nome exato preservar o UUID cadastrado;
- modelo 2 de Design Gráfico usar o texto real;
- destinatário adulterado ser recusado;
- corpo inventado ser recusado;
- horário passado não criar handoff;
- execução ocorrer somente depois da aprovação exata;
- `awaiting_device` não ser chamado de agendamento concluído;
- `scheduled_on_device` vir somente do ACK;
- retry não duplicar notificação.

## 13. Validação executada

Último estado validado:

```text
npm test                 → 161 testes aprovados
npx tsc --noEmit         → aprovado
npm run lint             → aprovado
npm run build            → build web aprovado
cd mobile; npm run build → build mobile aprovado
```

A build web reconheceu as novas rotas:

```text
/api/agent/turn
/api/schedule/status
```

Não foi executado teste real pago com a OpenAI, deploy, migration remota ou instalação do
APK no telefone.

## 14. Estado da working tree

Há mudanças locais ainda sem commit.

Arquivos modificados principais:

```text
.env.example
app/api/cron/reminders/route.ts
app/api/schedule/ack/route.ts
app/api/schedule/create/route.ts
app/api/schedule/redeem/route.ts
app/page.tsx
components/AssistantHub.tsx
lib/assistant/executor.ts
lib/assistant/memory.ts
lib/assistant/types.ts
lib/data/supabase-memory-repository.ts
lib/schedule/handoff.ts
mobile/README.md
mobile/src/main.ts
tests/assistant-phase3.test.ts
tests/schedule-handoff.test.ts
```

Arquivos/diretórios novos principais:

```text
app/api/agent/
app/api/schedule/status/
lib/agent/
lib/schedule/notification-id.ts
supabase/migrations/20260826000600_schedule_handoff_delivery_state.sql
supabase/migrations/20260826000700_agent_pending_approvals.sql
supabase/migrations/20260826000800_agent_contexts.sql
tests/agent-*.test.ts
tests/fixtures/agent-conversations.pt-BR.json
docs/claude-arquitetura-conversacional.md
```

Também existe `docs/analise-tecnica-projeto-2026-08-25.md`, que já estava na working
tree e deve ser preservado.

Nenhum commit, push ou deploy foi feito.

## 15. O que ainda não está implementado

O projeto ainda não é o JARVIS completo.

Faltam, entre outros:

- ferramentas Windows para abrir/fechar/focar aplicativos;
- busca e manipulação segura de arquivos;
- navegador e busca web;
- clipboard, volume, screenshot e informações do sistema;
- memória de longo prazo com consentimento, revisão e esquecimento;
- resumo progressivo automático da conversa;
- runner semântico que execute os 76 casos contra um LLM real;
- segundo provedor de LLM ou modelo local;
- streaming, interrupção, conversa contínua e wake word;
- envio real de grupos do WhatsApp sem interação — não assumir que isso seja permitido;
- teste físico do ACK/notificação em aparelho Android.

O piloto atual foi deliberadamente limitado a turmas, modelos e agendamento assistido.

## 16. Próximos passos recomendados

Executar nesta ordem:

1. Revisar o diff local e manter os arquivos do Claude intactos.
2. Aplicar as migrations `00600`, `00700` e `00800` em um ambiente Supabase de teste.
3. Confirmar que `SUPABASE_SECRET_KEY` está configurada apenas no servidor.
4. Executar testes live do Supabase.
5. Configurar `AGENT_V1_ENABLED=true` somente no ambiente de teste.
6. Fazer um teste real da rota agentic com a OpenAI.
7. Rodar `npm run sync` dentro de `mobile/`.
8. Gerar e reinstalar o APK; o aplicativo atualmente instalado não contém essas mudanças.
9. No telefone, permitir notificações e alarmes/lembretes quando solicitado.
10. Criar um teste com horário 5–10 minutos no futuro.
11. Verificar a sequência completa:

```text
pedido natural
→ turma/modelo corretos
→ confirmação explícita
→ app abre
→ app mostra “Agendado”
→ site recebe scheduled_on_device
→ notificação aparece no horário
→ toque abre WhatsApp/compartilhamento
```

12. Só depois decidir sobre ativação em produção.

## 17. Instrução curta para iniciar a próxima conversa

Use a seguinte mensagem:

> Leia `docs/resumo-handoff-agente-2026-08-27.md`, confira a working tree sem descartar
> alterações e continue pelo item 16. Não edite os dois arquivos entregues pelo Claude,
> não ative produção e não faça deploy sem minha autorização.
