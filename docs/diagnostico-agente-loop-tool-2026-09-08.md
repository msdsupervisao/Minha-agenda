# Diagnóstico técnico — agente entra em loop e falha em turnos com ferramenta

Data: 2026-09-08. Autor: Claude (diagnóstico; correção é do Codex).
Contexto: Etapa 4 publicada e infra OK (status 200, gatewayHealthy, Gemini→Groq, 197 testes),
mas o agente falha em pedidos reais com ferramenta. Exemplo do dono:
"me lembre de pagar a conta amanhã às 9" → "Não consegui concluir a tarefa dentro do limite de etapas."

## Sintoma
Qualquer turno que usa ferramenta (ex.: `create_reminder`) termina em
`max_steps` ("Não consegui concluir a tarefa dentro do limite de etapas.").
Pedidos só de texto funcionam.

## Causa raiz (com prova)
Depois que a ferramenta executa **com sucesso e verificada**, o Gemini (via OmniRoute)
**re-chama a MESMA ferramenta** em vez de emitir a resposta final. Isso se repete a cada
passo → estoura `maxSteps` (default 6) → `max_steps`.

Reprodução direta no gateway (2 turnos, `tools` presentes nos dois — como o provider real faz):
- Turno 1: modelo chama `create_reminder` com args ~corretos (ver "Detalhe" abaixo).
- Turno 2: recebe `role:tool` com resultado `{verified:true}` → **re-chama `create_reminder`**
  em vez de concluir. `finish_reason=tool_calls`, `content=""`.
- Confirmado em DOIS modelos: `gemini/gemini-3.1-flash-lite` e `gemini/gemini-3-flash-preview`.
  Logo, NÃO é um modelo fraco isolado — é sistemático.

Observação-chave: no teste anterior do "clima" a continuação concluiu porque **as `tools`
NÃO foram reenviadas** na 2ª chamada. O provider real (`openai-chat-completions.ts`) reenvia
`tools` em todo turno; com as tools presentes + a tradução do tool-result pro formato Gemini,
o Gemini não "enxerga" que a ferramenta já rodou e chama de novo. Suspeita: tradução
OpenAI→Gemini do `functionResponse` no OmniRoute, OU comportamento do Gemini com tools em contexto.

Nuance importante de UX: o lembrete PROVAVELMENTE foi salvo (guarda anti-duplicata do
orquestrador reusa o resultado verificado), mas o agente reportou falha. Ou seja, executou e
"mentiu" que não conseguiu.

## Ponto exato no código — `lib/agent/orchestrator.ts`
- `maxSteps` = `Math.max(1, Math.min(this.options.maxSteps ?? 6, 12))` (linha ~24).
- Loop `for (let step = 1; step <= maxSteps; step++)` (linha ~53).
- Guarda anti-duplicata (linhas ~123-125): quando o modelo re-chama tool não-read, sucesso,
  verificada, com args idênticos (`isDeepStrictEqual`), REUSA o resultado anterior
  (`previousEffect`) em vez de re-executar — bom (não duplica no banco), MAS o loop continua
  (linhas ~162-163), então vai pro próximo passo e o modelo re-chama de novo → linha ~166
  `fail(..., 'max_steps', ...)`.

## Fix #1 (maior alavanca, cirúrgico, robusto a qualquer modelo)
Detectar "re-chamada de algo já feito" e CONCLUIR em vez de continuar o loop.
Sugestão: no bloco que monta `currentResults` (linha ~120-131), se **todas** as `response.toolCalls`
do passo resolveram para `previousEffect` (ou seja, o modelo só re-chamou tools já
executadas+verificadas neste turno, sem trabalho novo e sem texto), então retornar
`kind:'completed'` com uma confirmação sintetizada a partir dos `toolResults` verificados,
em vez de seguir o loop até `max_steps`.
Isso resolve o sintoma imediato independentemente de o Gemini convergir ou não.

## Fixes secundários (todos confirmados nos testes)
2. Tradução tool-result OmniRoute→Gemini: investigar por que o Gemini não reconhece o
   `functionResponse` e re-chama (pode ser bug do gateway).
3. Modelo/provedor:
   - `gemini-3.1-flash-lite` é modelo de RACIOCÍNIO → lento (8–25s) e variável → estoura o
     **deadline interno de 15s do OmniRoute** (`resilienceSettings.requestQueue.maxWaitMs=15000`)
     → 504 intermitente. Subir esse deadline OU usar um modelo rápido/não-raciocínio que conclua.
   - Gemini free tier RATE-LIMITA sob carga (HTTP 429 "cooling down") — o agente faz várias
     chamadas por turno.
   - Fallback Groq está **403 (Cloudflare)** agora — sem fallback funcionando. Checar chave/limite Groq.
   - `gemini-2.5-flash*` retornam 404 (removidos) — só gemini-3.x disponível.
4. Menor: o modelo manda `delayMinutes: 0` em vez de `null` no caso `local_datetime`.
   Confirmar que `normalizeReminderArguments` roda ANTES da validação Zod (senão a validação
   falha e contribui pro loop). `reminderSchema` exige `delayMinutes===null` nesse caso.

## Reprodução (gateway direto, sem app/login)
POST `https://omniroute-msd-avodap-2026.fly.dev/v1/chat/completions` (Bearer = OMNIROUTE_API_KEY),
`model: gemini/gemini-3.1-flash-lite`, `tools:[create_reminder strict]`, e:
- msg1: system (data/fuso) + user "me lembre de pagar a conta amanha as 9" → devolve tool_call.
- msg2: + assistant(tool_call) + role:tool {verified:true} COM `tools` ainda no payload → re-chama
  a ferramenta (loop) em vez de concluir. (Se remover `tools` do payload no msg2, conclui — o que
  confirma que o gatilho é ter tools no contexto na continuação.)

## Critério de pronto do fix
"me lembre de pagar a conta amanhã às 9" → agente registra o lembrete E responde uma
confirmação curta, sem `max_steps`, em 1–2 passos.
