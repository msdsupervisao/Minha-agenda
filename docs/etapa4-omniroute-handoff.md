# Minha-agenda x OmniRoute - Etapa 4 + ajustes

Documento unico, reconciliado entre Claude e Codex. Base para executar a Etapa 4 sem quebrar o ciclo agentic.

Regra geral:

- Em producao, o `env` manda.
- `free-first` nao e default de producao.
- Qualquer modelo novo so entra depois de validacao real de tool calling e catalogo.

## 1. Objetivo

Ligar a Minha-agenda de producao ao gateway OmniRoute preservando o ciclo agentic:

intencao -> contexto/memoria -> LLM -> ferramenta -> execucao -> verificacao -> resposta.

O OmniRoute e so a camada substituivel de acesso aos modelos. Orquestracao, memoria, tools, aprovacoes e verificacao continuam na Minha-agenda.

## 2. Estado atual validado

- Gateway no ar: `https://omniroute-msd-avodap-2026.fly.dev`
- Fly configurado com regiao `gru`, imagem `diegosouzapw/omniroute:3.8.50`, VM 2 GB e volume `/data`
- Gemini cadastrado no gateway
- Groq cadastrado no gateway
- Ciclo agentic comprovado com `gemini/gemini-3.1-flash-lite`: tool call, JSON Schema strict, retorno de ferramenta, continuacao e resposta final fundamentada
- App local -> gateway prod validado: `/api/assistant/status` retorna "Servico de IA online"
- Credenciais guardadas localmente em `C:\Users\Avodap\AppData\Local\OmniRouteLab\prod-credentials.txt`
- Existem duas API keys validas; usar uma e revogar a outra

## 3. Portao de decisao

### Aprovado

- `OMNIROUTE_TIMEOUT_MS=60000`
- Validacao de tool calling real obrigatoria antes de liberar qualquer modelo novo
- Separar na UI "operacao estavel" de experimentos
- Versionar `fly.toml`
- Revogar a API key extra

### Mudar

- Producao: `env` manda. O primario vem de `OMNIROUTE_MODEL` na Vercel
- O cookie `ma_ai_route_chain` chega ao servidor e altera a cadeia usada no request. Nao e cosmetico. Entao a decisao precisa ser explicita: permitir override por cookie em producao ou bloquear
- Bug de semantica: hoje `chain[0]` do usuario nao vira o primario; o primario ainda vem do `env` e a cadeia entra como fallback. Isso precisa ser corrigido ou a UI precisa deixar explicito que edita apenas fallbacks
- Remover defaults hardcoded em `lib/assistant/ai-config.ts`, nao so no `.env`
- Qualquer opcao nova so pode aparecer depois de validacao contra o catalogo real do gateway

### Bloquear antes do deploy

- `auto/*` e qualquer default experimental nao podem ser padrao de producao sem provedores cadastrados e validados no Fly
- Sem catalogo real e sem audit de tool calling, modelo novo nao entra

## 4. Decisao do cookie em producao

O cookie `ma_ai_route_chain` chega ao servidor e troca a cadeia usada no request.

Decisao recomendada:

- bloquear o cookie em producao por ora
- ignorar o cookie quando `NODE_ENV=production` ou atras de flag

Motivo:

- a UI de producao nao deve expor caminhos experimentais
- um cookie pode quebrar o fallback silenciosamente
- so depois de repontar a UI para slugs reais e validar catalogo faz sentido reavaliar

Alternativa:

- permitir override por cookie, mas apenas com catalogo validado e slugs existentes no gateway

Status:

- decidido: bloquear em producao. Implementado em `lib/assistant/ai-config.ts`

## 5. Etapa 4 - variaveis na Vercel

Projeto: `minha-agenda1`
Escopo: Production

```dotenv
AI_PROVIDER=omniroute
OMNIROUTE_BASE_URL=https://omniroute-msd-avodap-2026.fly.dev/v1
OMNIROUTE_API_KEY=<chave salva do OmniRoute>
OMNIROUTE_MODEL=gemini/gemini-3.1-flash-lite
OMNIROUTE_FALLBACK_MODEL=groq/openai/gpt-oss-20b
OMNIROUTE_TIMEOUT_MS=60000
AGENT_V1_ENABLED=true
```

Setar os dois modelos blinda contra defaults ruins. Depois disso, redeploy.

## 6. Ajustes de codigo

1. `lib/assistant/ai-config.ts`
   - defaults hardcoded ajustados para `gemini/gemini-3.1-flash-lite` e `groq/openai/gpt-oss-20b`
   - defaults free-first removidos

2. `ai-config.ts` e rotas
   - decisao do cookie em producao aplicada via gate `allowCookieOverride`

3. `lib/agent/providers/omniroute-provider.ts` e `ai-config.ts`
   - semantica corrigida: `chain[0]` vira o primario quando houver cadeia valida e override permitido

4. `components/AiModelRouter.tsx`
   - UI repontada para os slugs reais do gateway
   - override bloqueado em producao

5. Validacao contra o catalogo real do gateway
   - requisito antes de liberar qualquer modelo novo

6. Higiene
   - commitar `fly.toml`
   - revogar a API key extra
   - manter `.env.local.bak` como backup quando for testar OmniRoute local

## 7. Definition of Done

- [x] Env na Vercel aplicado (Claude, via navegador: AI_PROVIDER=omniroute + 4 OMNIROUTE_*; OMNIROUTE_API_KEY adicionada pelo dono)
- [ ] **BLOQUEADOR: codigo da integracao OmniRoute commitado + pushado na branch de producao** (ver secao 9)
- [ ] `/api/assistant/status` de producao retorna "Servico de IA online"
- [ ] Turno real com tool executada e verificada
- [ ] Nenhum default experimental em producao
- [x] Decisao do cookie em producao implementada
- [ ] `fly.toml` commitado
- [ ] API key extra revogada

## 8. Fora de escopo agora

- `auto/*` conectado ao agente com roteamento automatico avancado
- Persistir a preferencia de rota por usuario no Supabase
- Ligar a selecao em `/api/notices/generate`
- Seletor visual por tiers

## 9. BLOQUEADOR REAL (descoberto 2026-09-08) — o codigo nao esta publicado

Sintoma: apos setar as env vars na Vercel (projeto minha-agenda1) e redeployar,
`GET https://minha-agenda1.vercel.app/api/assistant/status` retorna **HTTP 500** persistente
(~3 min de tentativas). Raiz `/` = 307 (app no ar), estatico = 200, mas `/api/health` = **404**.

Causa raiz: a Vercel so publica codigo **commitado/pushado**. Toda a integracao OmniRoute
esta no working tree LOCAL, nao commitada. `git status` em F:\PROJETOS\Minha-agenda
(branch `fix/openai-agent-strict-schema` @ 3c0dfca):
- `lib/agent/providers/omniroute-provider.ts` — untracked (??)
- `lib/agent/providers/openai-chat-completions.ts` — untracked
- `lib/assistant/ai-config.ts` — modificado (M)
- `lib/assistant/ai-route.ts` — untracked
- `lib/agent/availability.ts` — untracked
- `components/AiModelRouter.tsx` — untracked
- `app/api/health/` — untracked (por isso 404 em prod: prova que o build publicado NAO tem o codigo local)
- ~57 mudancas nao commitadas no total

Ou seja: as env vars estao certas, mas o build publicado (commit 3c0dfca) NAO tem o codigo
que sabe usar `AI_PROVIDER=omniroute`. Setar omniroute em cima do codigo antigo -> 500.

### Runbook para o Codex (commit + push + deploy)
1. Revisar as 57 mudancas (garantir que nao ha WIP/debug que nao deva shipar) e aplicar os
   ajustes do §6 ainda pendentes (defaults hardcoded, semantica chain[0], repontar UI free).
2. Confirmar a **branch de producao** da Vercel (o minha-agenda1 publicou um commit da
   `fix/openai-agent-strict-schema` — confirmar em Settings -> Git -> Production Branch).
3. Rodar local antes de shipar: `npm run typecheck` + `npm run test` + `npm run build`.
   - JA RODADO por Claude (2026-09-08): typecheck limpo, 26 testes de IA verdes,
     `npm run build` = "Compiled successfully" com zero erros (rotas /api/health e
     /api/assistant/status presentes). O working tree completo compila pra producao.
4. Commit + push da integracao na branch de producao.
5. Redeploy (automatico no push, ou manual).
6. Validar: `curl https://minha-agenda1.vercel.app/api/assistant/status` -> `"gatewayHealthy": true`.

Nota: o env `AI_PROVIDER=omniroute` ja esta setado em prod; enquanto o codigo nao sobe, o
endpoint 500a. Opcional reverter AI_PROVIDER pro valor antigo pra parar o 500 (mas o caminho
OpenAI ja estava travado por cota 429, entao o alvo e publicar o codigo do OmniRoute).
