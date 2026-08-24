# Minha Agenda

Assistente pessoal mobile-first: um único núcleo de voz recebe comandos naturais, interpreta uma ação e mostra o resultado sem transformar o fluxo em formulários.

## Estado atual

- controle central de voz com Web Speech API e fallback de texto;
- estados visuais: pronto, ouvindo, processando, executando, concluído, confirmação e erro;
- Gyro Rings como núcleo interativo, com toque, arraste e respostas visuais por estado;
- interpretação e execução separadas por intents validados;
- criação e consulta de gastos, lembretes, notas, tarefas e eventos;
- memória de contatos, contexto recente, resolução de homônimos e perguntas de continuação;
- confirmação obrigatória antes de enviar mensagens;
- histórico de ações, correção do último gasto e suporte a “desfaz isso”;
- persistência Supabase com autenticação SSR, RLS por usuário e fallback local de desenvolvimento;
- telas Hoje, Agenda, Finanças e Ajustes, além do CRUD de Turmas;
- PWA instalável com service worker, manifesto e ícones;
- notificações Web Push/VAPID de lembretes e teste manual pelo aparelho;
- fuso horário sincronizado com o dispositivo para interpretar, gravar, consultar e exibir datas;
- contrato `WhatsAppService` em modo mock: não envia nenhuma mensagem real;
- Responses API com Structured Outputs rígido, provider configurável e validação no backend;
- fallback local explícito quando não há chave, exibido na interface;
- observabilidade segura de intent, latência, tokens, resultado e custo estimado;
- autenticação mínima por e-mail e senha com sessão SSR persistente;
- caminho principal `UI → API → service → repository → Supabase` quando configurado;
- migrations versionadas, RLS por usuário e action logs persistentes;
- contexto curto persistido, sem memória infinita;
- modo local mantido somente como fallback de desenvolvimento;
- Next.js 16 Active LTS, React 19 e auditoria de dependências sem vulnerabilidades conhecidas.

Consulte a [persistência da Fase 5](docs/fase-5-supabase-persistencia.md), as [telas e turmas da Fase 6](docs/fase-6-telas-e-turmas.md), o [push da Fase 7](docs/fase-7-push.md), a [arquitetura de IA](docs/fase-4-cerebro-openai.md) e a [migração para Next.js 16](docs/nextjs-14-auditoria-seguranca.md).

## Desenvolvimento

```bash
npm install
npm run dev
npm run lint
npm test
npm run build
```

Abra `http://localhost:3000`.

Sem configuração Supabase, o aplicativo permanece em modo local para desenvolvimento. Com `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `/` exige autenticação e todos os comandos usam persistência real sujeita a RLS.

## Configuração de IA

Copie `.env.example` para `.env.local` e defina `AI_PROVIDER=openai` e `OPENAI_API_KEY`. Sem chave, a aplicação continua funcional em modo local e informa isso na tela. Segredos nunca devem usar o prefixo `NEXT_PUBLIC_`.

Com uma chave válida, execute `npm run test:openai-live` para validar duas interpretações diretamente na API oficial, sem executar ações no banco.

## Limites atuais

- a entrega automática de push depende de um agendador externo chamando `/api/cron/reminders` com `CRON_SECRET`;
- o teste ponta a ponta do push deve ser confirmado em aparelho real;
- sem `OPENAI_API_KEY`, a interpretação permanece no provider local;
- o envio real de WhatsApp continua fora do escopo e permanece mock.
