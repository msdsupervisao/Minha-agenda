# Fase 4 — cérebro real com OpenAI

Pesquisa e implementação registradas em 19 de agosto de 2026.

## Decisão

A aplicação usa a Responses API no backend com Structured Outputs e validação Zod. O modelo padrão é `gpt-5.4-mini`, configurável por `OPENAI_MODEL`: a documentação atual o descreve como um modelo mini eficiente para alto volume e confirma suporte a Responses API e Structured Outputs.

Nenhuma ferramenta, função de banco ou API externa é fornecida ao modelo. O modelo produz somente uma estrutura de intenção. A política da aplicação continua decidindo confirmações, e o `ConversationEngine` continua roteando para serviços explícitos.

Fontes oficiais consultadas antes da implementação:

- [Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs)
- [Responses API](https://developers.openai.com/api/reference/java/resources/beta/subresources/responses)
- [GPT-5.4 mini](https://developers.openai.com/api/docs/models/gpt-5.4-mini)
- [Erros da API](https://developers.openai.com/api/docs/guides/error-codes)
- [Boas práticas de produção](https://developers.openai.com/api/docs/guides/production-best-practices)

## Fluxo implementado

```text
voz/texto no cliente
  -> POST /api/assistant/interpret
     -> seleção explícita do provider
     -> OpenAI Responses API ou fallback local
     -> Structured Output estrito
     -> validação estrutural + semântica no servidor
     -> AssistantAction sem capacidade de execução
  -> ConversationEngine
     -> campos ausentes / resolução de contato
     -> política de confirmação
     -> ActionExecutor
     -> memória operacional / WhatsApp mock
  -> resposta ao cliente
```

Desde a Fase 5, o último trecho usa o repository Supabase autenticado quando o projeto está configurado. Sem configuração externa, o adaptador local da Fase 3 permanece somente como fallback de desenvolvimento.

## Provider explícito

```dotenv
AI_PROVIDER=openai
OPENAI_API_KEY=
OPENAI_MODEL=gpt-5.4-mini
OPENAI_TIMEOUT_MS=8000
APP_TIMEZONE=America/Cuiaba
```

- `AI_PROVIDER=local`: usa somente o interpretador determinístico.
- `AI_PROVIDER=openai` com chave: usa somente OpenAI; erro/timeout não aciona fallback silencioso.
- `AI_PROVIDER=openai` sem chave: ativa o modo local com motivo `missing_api_key` e mostra “Modo local ativo.” na tela.
- Sem `AI_PROVIDER`: escolhe OpenAI quando existe chave; caso contrário, local.

## Schema e segurança

O schema aceita somente os intents existentes, `confidence`, `requires_confirmation`, `language`, `entities` e `missing_fields`. Todos os campos do Structured Output são obrigatórios; dados opcionais usam `null`, e objetos usam `additionalProperties: false`.

Depois da validação do SDK, o backend valida novamente com Zod e aplica verificações semânticas para valores positivos e datas ISO válidas. `requires_confirmation` e `confidence` não autorizam nenhuma ação. O mapper sempre entrega a decisão à política da aplicação.

A chave é lida exclusivamente por código de rota/server. Não existe variável `NEXT_PUBLIC_OPENAI_*`, e a resposta da API não revela chave ou token.

## Observabilidade e custo

Cada interpretação registra somente:

- timestamp e ID da observação/ação;
- provider e modelo;
- intent detectado;
- latência e resultado;
- código de erro seguro;
- tokens de entrada, saída, cache e total;
- estimativa de custo quando há tabela conhecida para o modelo.

Texto do usuário, áudio, chaves e tokens não entram nesses registros. Em desenvolvimento existe um buffer em memória limitado a 500 observações e log JSON seguro. Para persistência futura, `supabase/schema.sql` contém `ai_usage_logs` com RLS.

A estimativa atual para `gpt-5.4-mini` usa os preços oficiais consultados nesta data: US$ 0,75 por milhão de tokens de entrada, US$ 0,075 de entrada em cache e US$ 4,50 de saída. Modelos desconhecidos deixam o custo como `null`.

## Diferenças entre os modos

| Comportamento | OpenAI | Local |
|---|---|---|
| Linguagem natural | Modelo `gpt-5.4-mini` | Regras determinísticas |
| Datas relativas | Resolvidas com data/fuso do servidor | Resolvidas pelo parser local |
| Contexto enviado | Até 10 turnos recentes | Contexto tratado pelo `ConversationEngine` |
| Tokens/custo | Registrados | Zero |
| Falha de rede | Erro seguro, sem execução | Não depende de rede |
| Execução | Nunca executa diretamente | Nunca executa diretamente |

## Estado da validação externa

O ambiente não contém `OPENAI_API_KEY`. A integração OpenAI foi testada com um transporte compatível mockado, incluindo schema real do SDK, uso de tokens, erro, timeout e resposta inválida. O modo sem chave foi testado pela rota real e pela interface. Uma chamada faturada à OpenAI continua dependendo da inclusão de uma chave válida em `.env.local`.

Depois de configurar a chave, o teste opt-in abaixo consulta a API real para um gasto e um lembrete, valida os intents e imprime apenas provider, modelo, intent, confiança, latência e uso — sem executar ações nem expor o texto ou a chave:

```bash
npm run test:openai-live
```
