# Robustez do fallback (Groq) — diagnóstico e plano

Data: 2026-09-08. Autor: Claude (diagnóstico; correção é do Codex).
Contexto: agente JARVIS funcionando end-to-end em produção. Isto é robustez, não bloqueador.

## O que era o "403 do Groq" — resolvido o mistério
Era **transitório**: o Cloudflare do Groq rate-limitou o IP do servidor (Fly) durante uma
rajada de testes meus. NÃO é chave/config quebrada.
Prova (2026-09-08, depois da rajada passar):
- Chamada `groq/openai/gpt-oss-20b` "oi" → **HTTP 200** (voltou a funcionar).
- Conexão no OmniRoute (`GET /api/providers?provider=groq`, admin): `groq - producao`,
  `isActive:true`, `lastError:null`, `rateLimitedUntil:null` → saudável.

## Problemas REAIS de robustez (esses valem correção)

### 1. 403/Cloudflare transitório NÃO é retryable → derruba o turno
Em `lib/agent/providers/omniroute-provider.ts` (~linha 52) o `retryable` cobre só
`408 | 429 | 5xx | agent_provider_timeout | APIConnectionTimeoutError`. Um **403** (que é o
que o Cloudflare do Groq devolve sob rate-limit) é tratado como **não-retryable** → quando o
primário (Gemini) cai num erro retryable e o fallback Groq responde 403 transitório, o turno
**falha inteiro** em vez de tentar de novo.
- Ação: tratar **403 transitório do gateway** como retryable-com-limite (ex.: 1 retry curto),
  distinguindo de 401 (auth real, não retry). Cuidado pra não criar retry infinito em 403 legítimo.

### 2. O modelo de fallback atual (`groq/openai/gpt-oss-20b`) é de RACIOCÍNIO
`gpt-oss-20b` retorna `reasoning`/`reasoning_tokens` e, com `max_tokens` baixo, corta em
`finish_reason:length` sem conteúdo (mesma classe de problema do gemini-flash-lite primário).
Fallback deveria ser rápido e previsível.
- Restrição descoberta: o catálogo VIVO da conta Groq é limitado e quase todo de raciocínio.
  NÃO estão vivos: `llama-3.3-70b-versatile`, `meta-llama/llama-4-scout-17b-16e-instruct` (ambos 400
  "not in active live catalog").
  Vivos (do sync da conexão, 14 modelos): `openai/gpt-oss-20b`, `openai/gpt-oss-120b`,
  `qwen/qwen3.8-27b`, `qwen/qwen3.6-27b`, `groq/compound`, `groq/compound-mini`, `allam-2-7b`
  (+ whisper/guard/tts que não servem pra chat).
- Ação: testar `groq/compound-mini` (sistema agêntico rápido da Groq) como fallback; validar
  tool-calling com o teste do `create_reminder`. Se nenhum for bom, manter `gpt-oss-20b` MAS
  garantir `max_tokens` generoso (o provider da MA não envia `max_tokens` — ok — mas confirmar
  que o gateway/modelo não corta cedo).

### 3. Panorama: free-tier é frágil pra agente
Gemini free + Groq free = modelos de raciocínio (lentos/8–25s) + rate-limits agressivos
(429/403 Cloudflare) + deadline interno de 15s do OmniRoute (`requestQueue.maxWaitMs=15000`)
→ 504/403 intermitentes sob a carga de múltiplas chamadas por turno do agente.
- Ações possíveis: subir o deadline do OmniRoute; espaçar/retry entre chamadas; e, para
  confiabilidade real de JARVIS, considerar um provedor/modelo pago mais estável e rápido
  (não-raciocínio) como primário no futuro.

## Plano sugerido (ordem)
1. (rápido) Tornar 403 transitório do gateway retryable-com-limite no `omniroute-provider.ts`
   — protege o turno quando o fallback pisca.
2. (rápido) Escolher/validar um fallback melhor: testar `groq/compound-mini` com tool-calling;
   senão manter `gpt-oss-20b`.
3. (médio) Subir o deadline de execução do OmniRoute acima da latência dos modelos de raciocínio.
4. (estratégico) Avaliar um modelo primário rápido/não-raciocínio (possivelmente pago) para
   snappiness e confiabilidade — o free-tier atual é o teto de qualidade hoje.

## Verificação
- Fallback: forçar falha do primário (ex.: `OMNIROUTE_MODEL` inválido temporário em preview) e
  confirmar que o turno cai no Groq e conclui — sem falhar por 403 transitório.
- Repro do tool-calling por modelo: POST `/v1/chat/completions` com a tool `create_reminder`
  strict (ver docs/diagnostico-agente-loop-tool-2026-09-08.md).
