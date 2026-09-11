# Spec — TTS natural (Azure Neural, voz masculina pt-BR "Antonio")

Objetivo: substituir o TTS do navegador (feminino/robótico) por voz masculina natural pt-BR,
via Azure Speech, mantendo o reconhecimento de voz (INPUT) como está.
Escolha do dono (2026-09-09): Azure `pt-BR-AntonioNeural`. Trocável depois se não gostar.

## Parte do DONO (pré-requisito, uma vez)
Criar recurso Azure Speech (grátis) e pegar Key + Region:
1. Conta Azure (portal.azure.com) → criar recurso **"Speech service"**.
2. Tier **F0 (Free)** = 0,5M caracteres/mês de voz neural (sobra pro app).
3. Copiar **KEY 1** e a **Region** (ex.: `brazilsouth`, `eastus`).
Entregar ao Codex pra virar secret (NUNCA commitar): `AZURE_SPEECH_KEY`, `AZURE_SPEECH_REGION`.
Preferir `brazilsouth` se disponível (menor latência).

## Parte do CODEX — endpoint `/api/tts`
Novo `app/api/tts/route.ts` (POST). Fluxo:
- Input: `{ text: string }`. Auth: mesma proteção das outras rotas (usuário logado).
- Sanitizar antes: reusar `stripMarkdownForSpeech` + remover emojis. **Cap de ~800 chars** (protege a cota).
- Cache por hash do texto sanitizado (as confirmações repetem) → devolve o mesmo áudio sem gastar cota/latência. LRU em memória já ajuda; KV/blob se quiser persistente.
- Chamar Azure REST TTS:
  - URL: `https://<REGION>.tts.speech.microsoft.com/cognitiveservices/v1`
  - Headers: `Ocp-Apim-Subscription-Key: <AZURE_SPEECH_KEY>`,
    `Content-Type: application/ssml+xml`,
    `X-Microsoft-OutputFormat: audio-24khz-48kbitrate-mono-mp3`,
    `User-Agent: minha-agenda`
  - Body (SSML):
    ```xml
    <speak version="1.0" xml:lang="pt-BR">
      <voice name="pt-BR-AntonioNeural">TEXTO_AQUI</voice>
    </speak>
    ```
    (opcional: `<prosody rate="+5%">` pra soar mais natural/ágil; escapar XML do texto)
- Resposta: devolver o `audio/mpeg` (stream/bytes) com `Cache-Control` adequado.
- Erros/cota: se o Azure falhar (429/5xx/limite), responder de forma que o cliente saiba cair no fallback.

## Parte do CODEX — cliente (`components/AssistantHub.tsx`)
- Na função de falar (hoje `speak(...)` usa `speechSynthesis`): trocar por
  `fetch('/api/tts', {method:'POST', body: JSON.stringify({text})})` → `blob()` →
  `const a = new Audio(URL.createObjectURL(blob)); a.play()`.
- **FALLBACK**: se o `/api/tts` falhar (rede/cota/erro), cair no `speechSynthesis` atual —
  a voz nunca quebra 100%.
- O **reconhecimento de voz (INPUT) continua igual** (Web Speech API + auto-stop de 3s).
- Revogar `objectURL` após tocar; não empilhar áudios (cancelar o anterior ao falar de novo).

## Critério de pronto
- Ao confirmar/responder, ouve-se a voz **masculina Antonio, natural** (não a do Android).
- Frase repetida vem do cache (instantânea).
- Se cortar a internet/cota, cai no TTS do navegador sem travar.
- Cota Azure monitorada (cap de chars + cache seguram bem abaixo dos 500k/mês).

## Depois (se quiser "ao máximo")
Trocar a voz é 1 linha (nome da voz). Pra máximo humano/clonagem: avaliar ElevenLabs ou XTTS —
mesma arquitetura de `/api/tts`, só muda o provedor.
