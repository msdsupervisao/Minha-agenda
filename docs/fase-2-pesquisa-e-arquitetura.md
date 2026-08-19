# Fase 2 — pesquisa e arquitetura do núcleo de voz

Data da pesquisa: 19 de agosto de 2026.

## Estado encontrado

- Stack atual: Next.js 14, React 18, TypeScript, Motion e Tailwind.
- Não há banco, PWA, SDK OpenAI ou integração WhatsApp ativos nesta versão.
- O Supabase existia em uma versão anterior, mas seus arquivos foram removidos e o app atual persiste apenas no `localStorage`.

Decisão: esta fase não introduz banco de dados nem troca o stack. A persistência local é mantida para validar o núcleo. O contrato dos repositórios será preparado para uma futura implementação com Supabase, em vez de acoplar componentes à persistência.

## Pesquisa de voz

### Web Speech API

- `SpeechRecognition` oferece reconhecimento no navegador, mas tem disponibilidade limitada entre navegadores; em alguns casos o áudio segue para um serviço remoto do navegador e não funciona offline.
- `getUserMedia()` é amplamente disponível, mas exige HTTPS (ou localhost) e autorização explícita para usar o microfone.
- Síntese com `speechSynthesis` serve como retorno de voz opcional sem colocar uma chave no cliente.

Decisão: usar Web Speech como entrada progressiva nesta etapa para o comando iniciado por toque, com `pt-BR`, transcrição visível e campo de texto como fallback obrigatório. Ele não será tratado como solução universal para iOS ou conversação contínua.

### OpenAI Audio e Realtime

- A API de áudio atual possui transcrição e síntese de fala.
- A Realtime API suporta interações de baixa latência por WebRTC, WebSocket e SIP, incluindo voz nativa.
- A Responses API é a interface apropriada para produzir ações estruturadas e chamadas de ferramenta; saídas estruturadas devem seguir um esquema rígido.

Decisão: para a primeira versão, o caminho de produção proposto é `áudio gravado -> endpoint servidor de transcrição -> Responses API -> ação estruturada`. Isso reduz escopo e mantém a separação de interpretação e execução. Realtime fica como evolução posterior para conversa contínua, depois de validar o fluxo por turnos e custo/latência em dispositivos reais.

Nenhuma chave OpenAI será exposta ao cliente. Sem `OPENAI_API_KEY`, o projeto usa um interpretador mock/determinístico apenas para demonstração e testes da interface.

## Pesquisa do WhatsApp Business Platform

- A Cloud API é a API oficial hospedada pela Meta para mensagens empresariais.
- Ela requer portfólio empresarial Meta, WhatsApp Business Account e um número comercial; os ativos podem ser criados no fluxo de início da Cloud API.
- O envio usa um `Phone Number ID` e token Bearer somente no servidor.
- Após uma mensagem recebida do cliente, a empresa pode responder com mensagem livre durante a janela de atendimento de 24 horas. Fora dela, a empresa só pode iniciar/continuar por template aprovado.
- Webhooks precisam de endpoint HTTPS verificável; a implementação deve verificar o desafio e a assinatura `x-hub-signature-256`.

Decisão: não haverá automação de WhatsApp Web, scraping ou token no frontend. Será criado o contrato `WhatsAppService` com modo mock. A ação de mensagem sempre exigirá confirmação; nesta fase ela apenas prepara a mensagem e mostra a confirmação.

## Push e PWA

- Uma PWA instalável precisa de manifesto; HTTPS é exigido em produção.
- Push usa service worker e uma assinatura por dispositivo; a inscrição deve ocorrer somente após opt-in do usuário.

Decisão: não implementar push nesta etapa. A arquitetura de lembretes preservará `dueAt` e `notificationStatus`, para conectar push posteriormente sem remodelar a ação.

## Arquitetura proposta

```text
VoiceInput (Web Speech / campo de texto)
  -> transcript
  -> AiInterpreter (mock agora; Responses API no servidor depois)
  -> IntentAction validada
  -> ConfirmationPolicy
  -> ActionExecutor
     -> LocalRepository nesta fase
     -> WhatsAppService mock para mensagens
  -> AssistantResponse (texto + fala opcional)
```

As ações aceitas são fechadas: `create_expense`, `create_reminder`, `create_note`, `create_task`, `create_event` e `send_whatsapp_message`. Texto do modelo nunca chama banco ou API externa diretamente.

## Fontes oficiais consultadas

- [OpenAI API — Realtime](https://platform.openai.com/docs/api-reference/realtime?lang=javascript)
- [OpenAI API — áudio](https://developers.openai.com/api/reference/resources/audio)
- [OpenAI API — Responses](https://platform.openai.com/overview)
- [MDN — SpeechRecognition](https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition)
- [MDN — getUserMedia](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia)
- [MDN — Push API](https://developer.mozilla.org/en-US/docs/Web/API/Push_API)
- [MDN — PWA instalável](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Making_PWAs_installable)
- [Meta — Cloud API overview](https://developers.facebook.com/docs/whatsapp/cloud-api/overview)
- [WhatsApp Business — política de janela de atendimento e templates](https://whatsappbusiness.com/policy/)
