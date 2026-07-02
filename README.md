# Minha Agenda

Agenda pessoal com login, acessível de qualquer lugar. Feita em Next.js + Supabase (banco de dados e autenticação), do mesmo jeito que o Tom Certo.

## 1. Criar o projeto no Supabase (gratuito)

1. Acesse https://supabase.com e crie uma conta.
2. Clique em "New project". Escolha um nome e uma senha para o banco (guarde essa senha).
3. Espere o projeto terminar de ser criado (leva ~2 minutos).
4. No menu lateral, vá em **SQL Editor** → **New query**.
5. Abra o arquivo `supabase/schema.sql` deste projeto, copie todo o conteúdo, cole no editor e clique em **RUN**. Isso cria a tabela de compromissos com segurança (cada pessoa só vê os próprios dados).
6. Vá em **Project Settings** (ícone de engrenagem) → **API**.
7. Copie a **Project URL** e a chave **anon public**.

## 2. Configurar o projeto local

1. Extraia esta pasta em `C:\Users\Avodap\Minha Agenda` (ou onde preferir).
2. Copie o arquivo `.env.local.example` e renomeie a cópia para `.env.local`.
3. Abra `.env.local` e cole a URL e a chave que você copiou do Supabase:

```
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJxxxxx...
```
> A URL deve ser apenas o domínio do projeto, sem `/rest/v1` no final.
4. Abra o terminal (CMD) nessa pasta e rode:

```
npm install
npm run dev
```

5. Acesse http://localhost:3000 — clique em **Criar conta**, entre com e-mail e senha, e comece a usar.

> Por padrão o Supabase pede confirmação por e-mail ao criar conta. Se quiser pular essa etapa enquanto testa, vá em **Authentication → Providers → Email** no painel do Supabase e desative "Confirm email".

## 3. Publicar na Vercel (igual ao Tom Certo)

1. Suba esta pasta para um repositório novo no GitHub.
2. Na Vercel, clique em **Add New → Project** e importe o repositório.
3. Em **Environment Variables**, adicione as mesmas duas variáveis do `.env.local`.
4. Clique em **Deploy**.

## Estrutura do projeto

```
app/
  login/          → tela de entrar/criar conta
  agenda/          → tela principal (lista + formulário de novo compromisso)
lib/supabase/      → conexão com o Supabase (navegador e servidor)
supabase/schema.sql → script para criar a tabela no banco
middleware.ts      → protege a rota /agenda para quem não fez login
```

## Próximos passos possíveis

- Editar um compromisso já criado (hoje só dá pra concluir ou excluir)
- Notificações/lembretes
- Visualização em calendário (mês inteiro)
- Repetir compromissos (diário, semanal)
