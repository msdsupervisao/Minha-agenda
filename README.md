# Minha Agenda

Assistente pessoal mobile-first: um único núcleo de voz recebe comandos naturais, interpreta uma ação e mostra o resultado sem transformar o fluxo em formulários.

## Fase 5 — memória persistente com Supabase

- controle central de voz com Web Speech API e fallback de texto;
- estados visuais: pronto, ouvindo, processando, executando, concluído, confirmação e erro;
- Gyro Rings como núcleo interativo, com toque, arraste e respostas visuais por estado;
- interpretação e execução separadas por intents validados;
- criação e consulta de gastos, lembretes, notas, tarefas e eventos;
- memória de contatos, contexto recente, resolução de homônimos e perguntas de continuação;
- confirmação obrigatória antes de enviar mensagens;
- histórico de ações, correção do último gasto e suporte a “desfaz isso”;
- ações persistidas em memória local versionada enquanto o Supabase remoto não está configurado;
- contrato `WhatsAppService` em modo mock: não envia nenhuma mensagem real.
- Responses API com Structured Outputs rígido, provider configurável e validação no backend;
- fallback local explícito quando não há chave, exibido na interface;
- observabilidade segura de intent, latência, tokens, resultado e custo estimado.
- autenticação mínima por e-mail e senha com sessão SSR persistente;
- caminho principal `UI → API → service → repository → Supabase` quando configurado;
- migrations versionadas, RLS por usuário e action logs persistentes;
- contexto curto persistido, sem memória infinita;
- modo local mantido somente como fallback de desenvolvimento.

Consulte [a implementação da Fase 5](docs/fase-5-supabase-persistencia.md), [a arquitetura da Fase 4](docs/fase-4-cerebro-openai.md), a [auditoria do Next.js 14](docs/nextjs-14-auditoria-seguranca.md) e a [migration Supabase](supabase/migrations/20260819000100_phase5_persistent_memory.sql).

## Desenvolvimento

```bash
npm install
npm run dev
npm test
```

Abra `http://localhost:3000`.

Sem configuração Supabase, o aplicativo permanece em modo local para desenvolvimento. Com `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `/` exige autenticação e todos os comandos usam persistência real sujeita a RLS.

## Configuração de IA

Copie `.env.example` para `.env.local` e defina `AI_PROVIDER=openai` e `OPENAI_API_KEY`. Sem chave, a aplicação continua funcional em modo local e informa isso na tela. Segredos nunca devem usar o prefixo `NEXT_PUBLIC_`.

Com uma chave válida, execute `npm run test:openai-live` para validar duas interpretações diretamente na API oficial, sem executar ações.

O banco remoto permanece desativado neste workspace até a configuração externa. O envio real de WhatsApp continua fora desta fase e permanece MOCK.
