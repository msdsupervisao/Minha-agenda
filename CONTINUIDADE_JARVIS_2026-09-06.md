# Continuidade — Minha Agenda + OmniRoute

Data: 2026-09-06
Projeto principal: `F:\PROJETOS\Minha-agenda`
Objetivo: transformar o Minha Agenda em um assistente pessoal por voz e texto, inspirado no JARVIS, preservando segurança, memória, ferramentas, aprovação e verificação.

## Estado atual

Os dois projetos foram unificados operacionalmente no Minha Agenda:

```text
Minha Agenda → AgentProvider → OmniRoute → Gemini / Groq
```

O Minha Agenda continua responsável por:

- intenção e contexto;
- memória e dados reais do Supabase;
- resolução de pessoas, turmas e horários;
- ferramentas e regras de negócio;
- aprovação de ações externas;
- execução;
- verificação por evidências;
- resposta final.

O OmniRoute é somente a camada de gateway, roteamento e fallback.

## Serviços em execução

- Aplicação: `http://127.0.0.1:3000`
- OmniRoute: `http://127.0.0.1:20128`
- Supervisor: `scripts/system.mjs`
- Estado: `.runtime/status.json`
- Logs: `.runtime/system.log`, `.runtime/omniroute.log`, `.runtime/web.log`

Comandos:

```bash
npm run dev
npm run health
npm run stop
```

O supervisor inicia os dois processos, verifica saúde, reinicia falhas transitórias e nunca mata processos externos desconhecidos.

## Modelos configurados

```text
Rota: auto/agent
Fallback: gerenciado pelo OmniRoute
```

O agente usa `auto/agent`; o OmniRoute escolhe somente candidatos com tool calling e executa o fallback do gateway. A agenda continua responsável pelas ferramentas, aprovações, execução e verificação.

O fallback só ocorre em timeout, 408, 429 ou erros 5xx. Falhas de autenticação, schema, argumentos inválidos e regras de negócio não trocam de modelo.

## Funcionalidades implementadas

- Provider OpenAI-compatible via `/v1/chat/completions`.
- Compatibilidade preservada com o provider Responses existente.
- Tool calling com JSON Schema strict.
- Continuação após tool call.
- Múltiplas etapas do agente.
- Retomada segura após aprovação.
- Preservação dos resultados anteriores durante aprovação.
- Bloqueio de falso sucesso após ferramenta não verificada.
- Progresso em NDJSON para a interface.
- Identificação de gateway, modelo, provedor upstream, latência e fallback.
- Listagem e pesquisa de turmas reais.
- Consulta de agenda: eventos, tarefas com prazo e lembretes.
- Pesquisa de contatos reais.
- Criação de notas com releitura de verificação.
- Criação de lembretes com releitura de verificação.
- Handoff Android continua exigindo confirmação do dispositivo.
- WhatsApp continua sem envio automático não autorizado.

## Arquivos principais novos ou modificados

- `lib/agent/providers/omniroute-provider.ts`
- `lib/agent/providers/openai-chat-completions.ts`
- `lib/agent/providers/openai-responses.ts`
- `lib/agent/orchestrator.ts`
- `lib/agent/server-agent.ts`
- `lib/agent/tools/classes.ts`
- `lib/agent/tools/personal-agenda.ts`
- `lib/data/agent-personal-repository.ts`
- `lib/agent/availability.ts`
- `app/api/agent/turn/route.ts`
- `app/api/assistant/status/route.ts`
- `app/api/health/route.ts`
- `components/AssistantHub.tsx`
- `scripts/system.mjs`
- `scripts/service-worker.mjs`
- `scripts/import-omniroute.mjs`
- `services/omniroute/runtime.lock.json`

## Runtime incorporado

OmniRoute incorporado em:

`services/omniroute/.runtime`

Versão fixada:

```text
OmniRoute 3.8.50
Node.js 22.22.2 portátil
```

O runtime foi copiado da instalação local existente. Não houve `npm install`, `npm rebuild`, atualização de pacote ou alteração do checkout principal do OmniRoute.

## Configuração local

`.env.local` está configurado com:

```text
AI_PROVIDER=omniroute
OMNIROUTE_BASE_URL=http://127.0.0.1:20128/v1
OMNIROUTE_MODEL=auto/agent
OMNIROUTE_FALLBACK_MODEL=
OMNIROUTE_TIMEOUT_MS=60000
AI_LOCAL_FIRST=false
AGENT_V1_ENABLED=true
```

Nenhum segredo foi exibido no relatório ou nos testes.

## Validação concluída

- TypeScript: aprovado.
- ESLint: aprovado.
- Build de produção: aprovado.
- Suíte completa: 189 testes aprovados.
- Saúde das duas portas: aprovada.
- Geração real Gemini via OmniRoute: HTTP 200.
- Tool call real fictício: aprovado.
- Retorno da ferramenta e resposta final: aprovados.

Teste real seguro realizado:

```text
consultar_clima_teste(cidade=Curitiba, unidade=celsius)
→ Em Curitiba está 27°C e ensolarado.
```

O endpoint `/v1/models` respondeu 401 sem catálogo público. Isso é esperado para o catálogo protegido do OmniRoute e não invalida a geração, que foi validada diretamente.

## Próximos passos recomendados

1. Abrir `http://127.0.0.1:3000` e autenticar.
2. Testar na interface “Liste minhas turmas”.
3. Testar “O que tenho na agenda hoje?”.
4. Testar criação de anotação.
5. Testar lembrete e confirmar que a resposta não promete entrega de notificação sem evidência.
6. Testar uma ação externa para validar o fluxo de aprovação.
7. Depois, validar o fallback real com uma falha controlada e observável.
8. Só então evoluir voz contínua, Android e rotas avançadas.

## Regras para a próxima conversa

- Não mover intenção, memória, ferramentas ou verificação para o OmniRoute.
- Não usar regex ou palavras-chave para interpretar intenção.
- Não inventar pessoas, turmas, horários, destinatários ou resultados.
- Não declarar sucesso sem `status=success` e `verified=true`.
- Manter a seleção automática restrita ao OmniRoute; a agenda não deve mover ferramentas, aprovação ou verificação para o gateway.
- Não instalar pacotes nem reconstruir o OmniRoute sem necessidade real.
- Não exibir chaves, cookies, tokens ou valores de `.env`.
- Preservar as alterações existentes e não fazer reset destrutivo.

## Comandos rápidos

```bash
cd F:\PROJETOS\Minha-agenda
npm run health
npm test
npm run lint
npm run build
```
