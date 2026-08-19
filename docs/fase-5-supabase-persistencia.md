# Fase 5 — memória persistente com Supabase

Pesquisa e implementação registradas em 19 de agosto de 2026.

## Decisões baseadas na documentação atual

- Projetos novos usam `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (`sb_publishable_...`) no cliente. A antiga `anon` é legada e não é usada nesta implementação.
- `SUPABASE_SECRET_KEY` é opcional, exclusivamente server-side e não participa do fluxo normal. As requisições usam a sessão do usuário e permanecem sujeitas a RLS.
- No servidor, a identidade é validada com `supabase.auth.getClaims()`. `getSession()` não é usado para decisões de autorização.
- Cada tabela pessoal tem grants somente para `authenticated`, RLS habilitado e policies separadas para `SELECT`, `INSERT`, `UPDATE` e `DELETE`.
- As policies usam `to authenticated` e `(select auth.uid()) = user_id`, com índice iniciado por `user_id` nas consultas principais.
- Migrations versionadas são a fonte de verdade; nenhuma alteração depende do Dashboard SQL Editor.

Fontes oficiais:

- [API keys](https://supabase.com/docs/guides/getting-started/api-keys)
- [SSR/Auth no Next.js](https://supabase.com/docs/guides/auth/server-side/creating-a-client?framework=nextjs)
- [Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Proteção de dados](https://supabase.com/docs/guides/database/secure-data)
- [Database migrations](https://supabase.com/docs/guides/local-development/database-migrations)
- [Edge Functions e autenticação](https://supabase.com/docs/guides/functions/auth)

## Fluxo implementado

```text
AssistantHub
  -> POST /api/assistant/command
     -> sessão validada por claims
     -> SupabaseMemoryRepository.load(user_id)
     -> ConversationEngine no backend
     -> OpenAI/local interpreter
     -> validator + confirmation policy + executor
     -> SupabaseMemoryRepository.persist(user_id)
     -> RLS no Postgres
  -> resposta e atividades
```

O modelo nunca recebe cliente, chave ou ferramenta Supabase. O `user_id` vem exclusivamente da sessão validada no servidor; valores recebidos do cliente não podem escolhê-lo.

Para preservar o comportamento aprovado das Fases 3 e 4, cada comando usa uma unidade de trabalho transitória no backend: carrega um recorte limitado, executa o `ConversationEngine` existente e persiste apenas registros novos, alterados ou removidos. Essa memória transitória não é a fonte persistente.

Sem configuração Supabase, o modo local continua disponível para desenvolvimento e aparece como “Dados locais.”. Com URL e publishable key, o caminho principal muda automaticamente para Supabase e exige login.

## Autenticação

A fase implementa somente:

- login por e-mail e senha em `/login`;
- cookies SSR e renovação de sessão pelo `middleware.ts` compatível com Next.js 14;
- recuperação da identidade com claims validados;
- logout por `POST /auth/logout`.

Não existe cadastro público. Crie os usuários necessários em **Authentication → Users** no Dashboard ou por um processo administrativo aprovado posteriormente.

## Migration e entidades

A migration inicial está em `supabase/migrations/20260819000100_phase5_persistent_memory.sql` e cria:

- `profiles`
- `contacts`
- `expenses`
- `reminders`
- `tasks`
- `notes`
- `events`
- `messages`
- `action_logs`
- `assistant_context`
- `ai_usage_logs`, preservada da Fase 4

`assistant_context` guarda somente os 12 turnos recentes, pergunta pendente e referências à última mensagem, entidade e ação. Não existe memória infinita.

Relacionamentos com contatos usam chave composta `(id, user_id)`, impedindo até mesmo uma referência acidental a um contato de outro usuário. Todas as entidades possuem `id`, `user_id`, `created_at` e `updated_at`; entidades operacionais também possuem `metadata` e `deleted_at` quando aplicável.

## Configuração de um projeto real

1. Crie um projeto Supabase.
2. No Dashboard, abra **Connect** e copie a Project URL e a publishable key.
3. Copie `.env.example` para `.env.local` e preencha:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://SEU-PROJETO.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

4. Vincule a CLI e aplique a migration:

```bash
npx supabase login
npx supabase link --project-ref SEU_PROJECT_REF
npx supabase db push
```

5. Crie pelo menos um usuário em **Authentication → Users**.
6. Reinicie o servidor Next.js e entre em `/login`.

Não é necessário configurar `SUPABASE_SECRET_KEY` para login, assistente ou persistência normal.

## Validação RLS em projeto real

Crie duas contas exclusivas de teste e preencha as quatro variáveis `SUPABASE_TEST_USER_*` descritas em `.env.example`. Depois execute:

```bash
npm run test:supabase-live
```

O script:

1. autentica os dois usuários com a publishable key;
2. cria gasto, lembrete e action log para o usuário A;
3. confirma a leitura do próprio gasto;
4. tenta ler o gasto com o usuário B e exige resultado vazio;
5. tenta inserir com `user_id` do usuário A usando a sessão B e exige bloqueio;
6. sai e entra novamente como A e confirma persistência;
7. remove os registros temporários.

O arquivo `supabase/tests/phase5_rls.sql` também verifica RLS, grants e a matriz de policies em um ambiente local Supabase.

## Edge Functions

Não houve migração indiscriminada para Edge Functions. O backend Next.js já fornece sessão validada, RLS e segredos server-side para OpenAI. Edge Functions passam a ter benefício concreto quando entrarem:

- webhooks públicos de WhatsApp;
- processamento assíncrono ou agendado;
- integrações que precisem ficar próximas do banco;
- chamadas autenticadas independentes do deploy Next.js.

Quando forem usadas para ações do usuário, deverão validar o JWT e criar um cliente no contexto desse usuário, mantendo RLS. Chaves secretas ficam reservadas a serviços administrativos que realmente precisem ignorar RLS.

## Estado da configuração externa

Este workspace não possui URL, publishable key, contas de teste, Supabase CLI, Docker ou PostgreSQL local. Por isso a migration não foi enviada a um projeto remoto e o teste RLS real não pôde ser executado aqui. O caminho Supabase, Auth e isolamento foram cobertos por testes automatizados com duas identidades; `npm run test:supabase-live` é a verificação final assim que as credenciais forem fornecidas.

WhatsApp permanece MOCK, OpenAI continua aguardando chave e o Next.js permanece em `14.2.15`.
