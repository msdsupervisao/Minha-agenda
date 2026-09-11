# Spec — TTS self-hosted (Kokoro no Fly) — voz masculina pt-BR, sem conta/verificação

Decisão do dono (2026-09-09): Opção 1 — Kokoro self-hosted no Fly. Motivo: qualquer cadastro
que dependa de código por e-mail (Hotmail) ou SMS falha pra ele. Kokoro NÃO precisa de conta,
e-mail nem cartão — só subir no Fly (conta Fly já funciona). Voz masculina pt-BR, custo = só a
VM (sem custo por caractere). Trocável depois por ElevenLabs (Gmail) se quiser "ao máximo".

## Parte A — Codex: subir o Kokoro no Fly (app separado)
- Imagem: **remsky/Kokoro-FastAPI (CPU)** — `ghcr.io/remsky/kokoro-fastapi-cpu` (confirmar tag atual no repo).
  OpenAI-compatible: `POST /v1/audio/speech`, e `GET /v1/audio/voices` lista as vozes.
- Novo app Fly (ex.: `minha-agenda-tts`), região `gru`, `internal_port = 8880`.
- Recursos: Kokoro-82M em CPU pede ~2 GB RAM. Usar VM 2 GB. **Volume** pra cache do modelo
  (evita rebaixar ~350 MB a cada boot). `min_machines_running = 1` (evita cold start no meio da demo);
  `auto_stop` desligado ou ciente do cold start.
- Confirmar a **voz masculina pt-BR** via `GET /v1/audio/voices`. Candidatas Kokoro pt-BR:
  `pm_alex`, `pm_santa` (masculinas), `pf_dora` (feminina). Escolher uma masculina.
- Teste rápido pós-deploy:
  `curl -X POST https://<app>.fly.dev/v1/audio/speech -H 'Content-Type: application/json'
   -d '{"model":"kokoro","input":"Olá, teste da nova voz.","voice":"pm_alex","response_format":"mp3"}' --output teste.mp3`

### Segurança (o endpoint fica público)
Kokoro-FastAPI não tem auth nativa. Como a Minha-agenda (Vercel) chama de fora, não dá pra usar
rede privada do Fly. Opções (Codex decide):
- Simples/aceitável agora: nome de app não-óbvio + `min_machines`/limites; risco baixo p/ app pessoal.
- Melhor: pôr um proxy/token na frente (a `/api/tts` da Minha-agenda envia um header secreto que
  um mini-middleware valida), ou registrar o Kokoro como provider OpenAI-compatible dentro do
  OmniRoute e chamar via OmniRoute (reusa a OMNIROUTE_API_KEY; mantém o Kokoro privado). Avaliar.

## Parte B — Codex: `/api/tts` na Minha-agenda (proxy + cache + fallback)
- `app/api/tts/route.ts` (POST, usuário logado). Input `{ text }`.
- Sanitizar (reusar `stripMarkdownForSpeech` + remover emoji), cap ~800 chars.
- Cache por hash do texto (confirmações repetem) → não re-sintetiza.
- Chamar `${TTS_BASE_URL}/v1/audio/speech` com `{model:"kokoro", voice:"pm_alex", input, response_format:"mp3"}`;
  devolver `audio/mpeg`. Se TTS_AUTH existir, mandar no header.
- Env/secrets: `TTS_BASE_URL` (URL do app Kokoro no Fly), `TTS_AUTH` (opcional).

## Parte C — Codex: cliente (`components/AssistantHub.tsx`)
- Trocar o `speechSynthesis.speak(...)` de saída por `fetch('/api/tts')` → `blob` → `new Audio(url).play()`.
- **FALLBACK**: se `/api/tts` falhar (rede/serviço), cair no `speechSynthesis` atual — voz nunca quebra.
- Reconhecimento de voz de ENTRADA continua igual (auto-stop 3s). Cancelar áudio anterior ao falar de novo.

## Critério de pronto
- Ao responder, ouve-se voz **masculina natural** (Kokoro pt-BR), não a do Android.
- Frase repetida sai do cache (instantânea).
- Kokoro fora do ar → cai no TTS do navegador sem travar.
- Latência aceitável (CPU: alguns segundos na 1ª; cache resolve repetidas). Se lento, avaliar VM maior.

## Notas
- Perf: inferência CPU do Kokoro-82M leva ~1–4s por frase curta; o cache e `min_machines=1` seguram a UX.
- Qualidade: Kokoro é bem melhor que o TTS do navegador; se quiser "ao máximo humano" depois,
  a mesma `/api/tts` aponta pra ElevenLabs (cadastro via Gmail) só trocando base/voz.

Fontes: remsky/Kokoro-FastAPI (github.com/remsky/Kokoro-FastAPI) — OpenAI-compatible, pt-BR, CPU.
