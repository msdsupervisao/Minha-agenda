# OmniRoute — como aproveitar de verdade (plano)

> Escrito em 2026-10-06. Diagnóstico feito ao vivo no dashboard de produção
> (`omniroute-msd-avodap-2026.fly.dev`), nos docs do portfólio e no código.
> Gateway de produção da Minha-agenda. Dono: Fernando Padova.

## 1. Diagnóstico — por que "só usa um modelo"

Duas causas, as duas reais:

1. **Só 2 de 347 provedores estão cadastrados** no gateway (`Total 2/347`; grátis `2/154`:
   apenas **Gemini** e **Groq**). Os roteadores `auto/*` escolhem **entre os provedores
   conectados** — com 2, não há praticamente o que rotear.
2. **Foi uma decisão conservadora, nunca revista.** `docs/etapa4-omniroute-handoff.md`
   bloqueou `auto/*` em produção "sem validação de tool-calling" e deixou o roteamento
   automático "fora de escopo". Fixou-se `OMNIROUTE_MODEL=gemini/gemini-3.1-flash-lite`
   com **um** fallback (`groq/openai/gpt-oss-20b`). A validação pendente nunca foi feita.

Resultado: o motor (Ferrari) roda com 2 de 347 cilindros. ~99% do OmniRoute está desligado.

## 2. O que o OmniRoute oferece (hoje desligado)

Confirmado no dashboard:

- **17 roteadores `auto/*`** zero-config (`auto/best-free`, `auto/smart`, `auto/cheap`,
  `auto/best-coding`, `auto/best-chat`…). Resolvem dinamicamente a partir dos provedores
  conectados — nenhuma configuração necessária; é só usar o id como `model`.
- **13 estratégias de combo** para combos próprios: cost-optimized, fastest, round-robin,
  weighted, fill-first, P2C, least-used, fallback por provider/conta/combo, etc.
- **154 provedores de plano gratuito** disponíveis (2 ativos) e **20 via OAuth**
  (login uma vez; o gateway renova o token): Kimi Code, Antigravity, Amazon Q, etc.
- Além de chat: **TTS, Speech→Text, Imagem, Vídeo, Música, Embedding, Busca, Web Fetch**
  — tudo em `0` configurado, acessível pelo mesmo endpoint `/v1`.

## 3. Como extrair o máximo (por ordem de impacto)

### Alavanca 1 — Cadastrar mais provedores grátis (maior ganho)
Sair de 2 → dezenas. Prioridade:
- **Sem-auth / grátis diretos** (não exigem login nem chave) — posso cadastrar sozinho.
- **OAuth grátis** (Kimi, Antigravity, Amazon Q…) — login é do Fernando (uma vez).
- **Chave de API grátis** (ex.: Cerebras, OpenRouter free, etc.) — a chave é do Fernando.

Cadastrar provedor **não muda** o que o app usa (o app segue em `OMNIROUTE_MODEL`); só
aumenta o pool para os combos/auto. Portanto é seguro expandir primeiro.

### Alavanca 2 — Trocar o modelo fixo por um combo (depois de validar)
- Validar **tool-calling** nos candidatos (a tarefa pendente da Etapa 4).
- Trocar `OMNIROUTE_MODEL` para `auto/best-free` ou um combo próprio `cost-optimized`
  com fallback. O código já suporta cadeia via `OMNIROUTE_FALLBACK_MODELS`
  (hoje com 1 item).

### Alavanca 3 — Roteamento por tarefa
Modelo barato/rápido para intenção; modelo forte para compor aviso. O OmniRoute já tem
`taskAwareRouter`. Na Minha-agenda daria para usar modelos diferentes no agente vs no
`compose_notice`/`generateNoticeVariants`.

### Alavanca 4 — Usar as outras capacidades pelo mesmo endpoint
TTS, Speech→Text, Imagem, Embedding, Busca. Inclusive a voz (TTS) poderia sair daqui se
um provedor de TTS grátis for cadastrado.

## 4. Onde usar nos outros projetos

| Projeto | Uso de IA hoje | Oportunidade com OmniRoute |
|---|---|---|
| **ProfessorIA-App/Web** | OpenAI/Whisper **direto (pago, 1 provedor)** | Resumo/quiz em modelos **grátis** + fallback; transcrição via Speech→Text do gateway. **Maior economia do portfólio.** |
| **Volt Fitness** | IA planejada | Já nascer no gateway (grátis-first + fallback) |
| **Tom Certo** | áudio local; pouca IA | Se entrar IA, mesmo caminho |
| **Qualquer novo** | — | Um endpoint, grátis-first, fallback, observabilidade |

## 5. Plano de execução

- [ ] **Fase 1 — Cadastrar provedores grátis** (começa agora)
  - [ ] Sem-auth/grátis diretos — Claude faz sozinho (overnight)
  - [ ] OAuth grátis (Kimi, Antigravity, Amazon Q…) — login do Fernando
  - [ ] Chave de API grátis (Cerebras/OpenRouter free…) — chave do Fernando
- [ ] **Fase 2 — Validar tool-calling** nos melhores candidatos (via Playground do
      dashboard ou script de validação). Só passa quem fizer tool call + JSON strict.
- [ ] **Fase 3 — Ligar combo na Minha-agenda**: `OMNIROUTE_MODEL=auto/best-free`
      (ou combo próprio) + cadeia de fallback real; medir latência/qualidade.
- [ ] **Fase 4 — Roteamento por tarefa** (intenção barata / composição forte).
- [ ] **Fase 5 — ProfessorIA no gateway** (resumo/quiz grátis + transcrição).

## 6. Observações de segurança
- Cadastrar provedor OAuth/chave exige credenciais do Fernando — Claude não insere
  segredos nem faz login por ele.
- Trocar `OMNIROUTE_MODEL` em produção só depois de validar tool-calling (senão o agente
  pode quebrar como na Etapa 4).
- O gateway reinicia a cada ~9 min (exit 143) — investigar à parte (não bloqueia este plano).

## 7. Status do cadastro automático (execução da noite de 2026-10-06)

Investigado ao vivo no dashboard. Descobertas que mudam o plano de cadastro:

- **Os provedores "Sem Auth" (13) já vêm "Ativado" por padrão.** O contador `2/347`
  conta apenas **conexões com credencial** (Gemini + Groq). Os sem-auth já estão no pool
  sem cadastro — ou seja, não há o que "registrar" neles.
- **Mas eles são instáveis.** Teste ao vivo: no `Cloudflare AI Playground` (20 modelos,
  já Ativado) o modelo `cfp/zai-org/glm-5.2` **falhou no teste** (erro vermelho). Endpoints
  grátis abertos (AI Horde, DuckDuckGo AI Chat, Cloudflare Playground…) oscilam e **não são
  confiáveis** para rotear um assistente de produção às cegas.
- **Decisão:** NÃO encher a produção com os 13 sem-auth no escuro. Baixo valor + risco de
  degradar o `auto/*` depois. Eles continuam disponíveis caso um combo específico queira usá-los.

### O que realmente falta (precisa do Fernando)
- **Cadastrar provedores grátis BONS** que exigem login/chave (uma vez):
  - OAuth (0/20): **Kimi Code**, Antigravity, Amazon Q — login do Fernando; token renova sozinho.
  - Chave de API grátis (ex.: **Cerebras**, OpenRouter free) — chave do Fernando.
- **Validar tool-calling** nos candidatos (Playground do dashboard ou script) antes de ligar.
- **Trocar `OMNIROUTE_MODEL`** para um combo validado (`auto/best-free` ou combo próprio
  `cost-optimized` com fallback), medindo latência/qualidade.

### Resumo honesto
A parte que dava pra fazer sozinho (sem-auth) **já estava feita pelo próprio OmniRoute** e é
de baixa qualidade. O ganho real do "usar o máximo do OmniRoute" depende de cadastrar os
provedores grátis bons (com seu login) e apontar o app para um combo validado — tarefas para
fazermos juntos, não no escuro.
