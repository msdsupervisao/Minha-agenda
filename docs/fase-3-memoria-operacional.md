# Fase 3 — memória operacional e ações reais

Pesquisa e decisão registradas em 19 de agosto de 2026.

## Estado encontrado

A aplicação está em Next.js 14, React 18 e TypeScript. O histórico do projeto já continha Supabase, autenticação e a tabela `compromissos`, embora esses arquivos estivessem removidos na versão da tela da Fase 2. Não há `.env.local`, chave OpenAI nem credencial da Meta configurada neste workspace. A Fase 2 usa `localStorage` e um interpretador determinístico.

## Decisões

- Manter a tela e o Gyro Rings existentes.
- Criar uma memória local estruturada e migrável, suficiente para validar relações, consultas, contexto, histórico e desfazer em um único dispositivo.
- Preservar o stack Supabase existente: os clientes foram recompostos, `compromissos` foi mantida como entidade de eventos e o esquema foi ampliado em `supabase/schema.sql`, sem aplicar migração remotamente na ausência das credenciais.
- Usar a memória local versionada como implementação executável desta fase enquanto autenticação/projeto remoto não estão configurados. Ela é um adaptador, não um segundo banco escolhido para produção.
- Manter o interpretador determinístico como fallback funcional. Uma futura chamada OpenAI deverá ocorrer no servidor e devolver somente uma união fechada de intents via Structured Outputs (`json_schema`).
- Manter WhatsApp em modo mock. Envio real exigirá confirmação, opt-in do destinatário e validação da janela de atendimento/template no servidor.

## Arquitetura

```text
Voice/Text
  -> ConversationEngine
     -> PendingQuestion resolver
     -> IntentInterpreter
     -> ContactResolver
     -> Validation
     -> ConfirmationPolicy
     -> ActionExecutor
        -> OperationalMemoryRepository
        -> WhatsAppService (mock / Cloud API futura)
     -> ActionLog + Undo snapshot
  -> resposta natural
```

## Memória limitada

Uma única raiz versionada guarda coleções de `contacts`, `expenses`, `tasks`, `reminders`, `events`, `notes`, `messages`, `actionLogs` e até 12 turnos recentes. A memória não guarda áudio. Histórico operacional é limitado a 100 registros locais.

No esquema Supabase, a coleção local `events` corresponde à tabela preexistente `compromissos`; não foi criada uma tabela concorrente. As demais entidades e políticas RLS estão preparadas em [`supabase/schema.sql`](../supabase/schema.sql).

## Segurança e integrações

- A documentação atual da OpenAI recomenda `json_schema` para saídas estruturadas em vez do modo JSON antigo.
- Supabase Edge Functions são adequadas para inferência curta, webhooks e integrações; segredos devem ser variáveis do projeto e chaves secretas nunca devem chegar ao navegador.
- A política do WhatsApp exige opt-in. Fora da janela de 24 horas após a última mensagem do usuário, somente templates aprovados podem ser enviados.
- `OPENAI_API_KEY`, tokens e segredos da Meta aparecem apenas como variáveis server-side no arquivo de exemplo; nenhum segredo é consumido pelo frontend.

## Limites externos desta entrega

- O envio do WhatsApp permanece em mock e registra `mock_sent`; nenhuma mensagem real sai do aplicativo.
- O interpretador local é o fallback funcional. A chamada à Responses API será ativada no servidor quando houver chave, mantendo a mesma união fechada de intents.
- Lembretes são persistidos, mas push agendado depende do projeto Supabase e da infraestrutura de notificação a serem configurados.

## Fontes

- [OpenAI Structured Outputs / Responses](https://developers.openai.com/api/docs/guides/structured-outputs)
- [OpenAI Realtime e áudio](https://developers.openai.com/api/docs/guides/realtime)
- [Supabase Edge Functions](https://supabase.com/docs/guides/functions)
- [Supabase secrets](https://supabase.com/docs/guides/functions/secrets)
- [WhatsApp Business Messaging Policy](https://whatsappbusiness.com/policy/)
