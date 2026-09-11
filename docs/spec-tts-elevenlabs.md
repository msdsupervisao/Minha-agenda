# Spec — trocar TTS para ElevenLabs (voz BR natural) — 2026-09-09

Decisão do dono: Kokoro (self-hosted) tem sotaque ruim em pt-BR → migrar para **ElevenLabs**
(voz masculina brasileira natural). Cadastro pelo **Gmail** do dono (não Hotmail → código chega).
A arquitetura `/api/tts` + `lib/tts` já existe; é trocar o provedor de destino, não refazer.

## Parte do DONO (uma vez)
1. Criar conta em elevenlabs.io com o **Gmail** (supervisaomsdsorriso@gmail.com).
2. Pegar a **API key** (Profile → API Key).
3. Escolher a voz: **Voice Library** → filtrar **Portuguese / Brazilian** + **male** → ouvir samples →
   escolher uma → "Add to my voices" → copiar o **Voice ID**.
4. Entregar ao Codex (secret, nunca commitar): `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_ID`.

## Parte do CODEX — trocar o destino em `lib/tts/server.ts`
Hoje o `createTtsService` chama `${TTS_BASE_URL}/v1/audio/speech` (Kokoro, `model:'kokoro', voice:'pm_alex'`).
Trocar para chamar a API do ElevenLabs (mantendo cache, dedup inflight, cap 800, e o retorno mp3):
- URL: `https://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_VOICE_ID}?output_format=mp3_44100_128`
- Método POST, headers: `xi-api-key: ${ELEVENLABS_API_KEY}`, `content-type: application/json`
- Body: `{ "text": <texto>, "model_id": "eleven_multilingual_v2", "voice_settings": { "stability": 0.5, "similarity_boost": 0.8 } }`
  (multilingual_v2 = qualidade; se quiser mais barato/rápido, `eleven_turbo_v2_5`)
- Resposta é `audio/mpeg` (bytes) → devolver igual ao fluxo atual.
- Manter a **chave de cache** incluindo o voice_id/provedor (não misturar com o cache do Kokoro).
- Env: usar `ELEVENLABS_API_KEY` + `ELEVENLABS_VOICE_ID` (aposentar `TTS_BASE_URL`/`TTS_AUTH` do caminho de voz, ou manter como fallback).

## Vercel + deploy (Codex)
- Setar `ELEVENLABS_API_KEY` e `ELEVENLABS_VOICE_ID` na Vercel (Production).
- Commit do WIP (`app/api/tts`, `lib/tts`, `AssistantHub.tsx`) + deploy.
- O cliente e o fallback pro TTS do navegador continuam iguais.

## Limpeza (opcional, DEPOIS de validar ElevenLabs)
- O app Fly `minha-agenda-tts` (Kokoro) deixa de ser necessário → pode ser destruído p/ economizar a VM.
  (Manter até o ElevenLabs estar validado, como rede de segurança.)

## Validação (Claude, após deploy)
- Testar `/api/tts` em produção: retorna mp3 com a voz BR escolhida, cache HIT na 2ª chamada,
  fallback ok. Enviar amostra pro dono ouvir/aprovar.

## Custo
- Free 10k chars/mês (cobre o uso de confirmações). Depois planos baratos por caractere.

Nota: o `/v1/audio/speech` e `/v1/voices` do OmniRoute também são feitos p/ ElevenLabs — alternativa
seria registrar a chave no OmniRoute e chamar via gateway (reusa OMNIROUTE_API_KEY). Mas chamar o
ElevenLabs direto do `/api/tts` é mais simples e sem dependência extra. Preferir o direto.
