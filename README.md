# Minha Agenda

Assistente pessoal mobile-first, inspirado no JARVIS: um único núcleo de voz e texto entende o pedido, consulta memória e dados reais, escolhe ferramentas, executa com confirmação quando necessário, verifica a fonte e responde de forma curta e honesta.

O repositório agora contém a operação unificada: `Minha Agenda → AgentProvider → OmniRoute → Gemini/Groq`. O aplicativo continua dono da intenção, contexto, memória, ferramentas, regras de negócio, aprovação e verificação; o OmniRoute é apenas a camada substituível de acesso aos modelos.

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
- ciclo agentic com tools, argumentos strict, retorno de ferramenta, continuação, aprovação, evidência e progresso NDJSON;
- OmniRoute v3.8.50 incorporado em `services/omniroute/.runtime` a partir da instalação local já existente, sem reinstalação ou cópia de credenciais;
- rota automática de agente pelo OmniRoute, filtrada por capacidade de tool calling e com fallback;
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
npm run health
npm run lint
npm test
npm run build
```

Abra `http://localhost:3000`.

Sem configuração Supabase, o aplicativo permanece em modo local para desenvolvimento. Com `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `/` exige autenticação e todos os comandos usam persistência real sujeita a RLS.

## Configuração de IA

Copie `.env.example` para `.env.local`, inicie `npm run dev` e mantenha `AI_PROVIDER=omniroute`. O supervisor inicia o gateway em `127.0.0.1:20128` e a aplicação em `127.0.0.1:3000`. O caminho estável usa `gemini/gemini-3.1-flash-lite` como rota principal e `groq/openai/gpt-oss-20b` como fallback. O OmniRoute aceita slugs `provider/model`, executa a troca de rota quando a primeira opção falha e devolve o provider/modelo efetivos. Segredos nunca devem usar o prefixo `NEXT_PUBLIC_`.

Use `npm run setup:runtime` somente quando a instalação local do OmniRoute mudar; o comando incorpora uma versão já instalada e fixada, sem executar `npm install`, `npm rebuild` ou atualizar o checkout original.

Com uma chave válida, execute `npm run test:openai-live` para validar duas interpretações diretamente na API oficial, sem executar ações no banco.

## Limites atuais

- a entrega automática de push depende de um agendador externo chamando `/api/cron/reminders` com `CRON_SECRET`;
- o teste ponta a ponta do push deve ser confirmado em aparelho real;
- o indicador de saúde verifica o processo e a rota, enquanto cada execução registra o modelo e o provedor retornados pelo gateway;
- o envio real de WhatsApp continua fora do escopo e permanece mock.
