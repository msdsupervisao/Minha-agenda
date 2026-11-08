# Disponibilidade da IA, Jev e alternativas de API

Análise de 17/10/2026. Nenhuma configuração de produção foi alterada.

## O que foi reproduzido

- `GET https://minha-agenda1.vercel.app/api/assistant/status` retornou HTTP 200 com `gatewayHealthy: false` e `notice: "Serviço de IA indisponível."` em duas consultas, em aproximadamente 4,3–4,5 segundos.
- O gateway configurado é `https://omniroute-msd-avodap-2026.fly.dev/v1`. O primário anunciado em produção é `gemini/gemini-3.1-flash-lite` e há fallback configurado. Localmente, o fallback é `groq/openai/gpt-oss-20b`; a lista exata de produção não é exposta pelo status.
- As consultas diretas ao `/api/health` e ao `/v1/models` do gateway esgotaram o limite inicial de 12 segundos. Em uma nova consulta com limite de 45 segundos, `/api/health` devolveu HTTP 503 após aproximadamente 35,3 segundos, sem corpo.
- Portanto, há uma indisponibilidade real no caminho do gateway. Esses resultados não comprovam chave inválida, saldo esgotado ou defeito no modelo Gemini. Não houve resposta de geração que permitisse concluir isso.
- O painel Fly exigiu login e a ferramenta local informou ausência de token de acesso. Sem os eventos e logs autenticados, não foi possível determinar se a máquina está parada, reiniciando, sem recursos, com problema de inicialização ou com outra falha interna.

Reprodução sem credenciais: consultar o status público acima e o `/api/health` do gateway, registrando código HTTP e duração. Foram usadas requisições HTTP reais; não se trata de um teste com resposta simulada.

## Por que a tela mostra essa mensagem

`lib/agent/availability.ts` consulta `/api/health` e `/v1/models` em paralelo, com limite de 4 segundos por consulta. Qualquer exceção faz o status inteiro retornar a mensagem genérica de indisponibilidade. `components/AssistantHub.tsx` mostra esse texto e repete a consulta a cada 30 segundos.

Há também uma possibilidade de falso negativo: um erro apenas na listagem de modelos derruba o resultado de saúde porque as consultas compartilham um `Promise.all` e um único `catch`. Isso é um problema de diagnóstico no código, mas não explica sozinho o caso observado: o endpoint de saúde também falhou de verdade.

O status verifica o gateway e seu catálogo, não realiza uma geração nem valida a cota de cada provedor. Um status saudável também não garante que Gemini e Groq conseguirão atender uma chamada.

## Limitações da arquitetura atual

1. Gemini e Groq passam pelo mesmo servidor OmniRoute. Trocar o modelo dentro dele não contorna uma queda desse servidor.
2. O fallback do agente muda o modelo, mantendo endereço e credencial do gateway. Não há fallback entre conexões diretas independentes.
3. `lib/assistant/ai-config.ts` permite que o modo `openai` herde `OMNIROUTE_BASE_URL` quando `OPENAI_BASE_URL` está ausente. Alterar apenas `AI_PROVIDER` pode manter a dependência do Fly.
4. Composição de avisos, rascunhos educacionais e resumo rolante fazem suas próprias chamadas com a configuração principal. Não herdam automaticamente a escolha de fallback feita dentro do orquestrador.
5. Não foi encontrada integração Jev/TypeSafe na Minha Agenda. Na configuração local, não há chave identificada como Jev/TypeSafe. Isso não estabelece quais credenciais existem em outros ambientes.

## Onde o Jev se encaixa

O Jev da TypeSafe recebe estado e perguntas tipadas, e retorna escolhas, probabilidades e, em certos tipos, confiança. Sua API usa `POST /v1/systemone`, com modelos consultados em `GET /v1/models`. Não é uma substituição direta de `chat/completions`; requer um adaptador próprio. Fontes: [introdução](https://docs.typesafe.ai/introduction) e [referência da API](https://api.typesafe.ai/redoc).

Aplicação proposta para este projeto:

- Identificar o domínio: turmas, avisos, agenda, conteúdo educacional, memória ou conversa geral.
- Distinguir intenção: criar texto, consultar dados, agendar entrega ou continuar/revisar o rascunho atual.
- Selecionar um conjunto menor de ferramentas e instruções pertinentes. O ganho de latência depende de economizar trabalho posterior; adicionar uma classificação sem reduzir o restante apenas acrescenta uma requisição.
- Passar o pedido original e o contexto necessário para uma IA generativa escrever o aviso ou concluir a resposta.

Exemplo: “Crie um aviso para designer de quarta” pode ser classificado como `aviso / criar_rascunho`. O código busca a turma real e a IA generativa escreve um texto novo. Jev não deve inventar o identificador da turma nem executar o envio. Datas, UUIDs, permissões e efeitos continuam validados pelo código.

A TypeSafe publica preço de US$ 0,042 por milhão de tokens de entrada e saída gratuita. Mil classificações com mil tokens faturáveis cada custariam aproximadamente US$ 0,042. Isso é uma conta ilustrativa, não uma medição do nosso tráfego. A garantia de formato tipado não significa decisão semanticamente correta. Fonte: [apresentação oficial](https://typesafe.ai/blog/introducing-system-one-models-and-jev).

Antes de ativar roteamento: avaliar pedidos reais em português, transcrições com erros, referências como “essa turma”, pedidos múltiplos e revisões de texto. Começar registrando a classificação sem deixá-la mudar o fluxo; comparar com o resultado esperado. Fixar a versão testada. Confiança baixa, erro ou timeout devem manter o fluxo geral. Limiares e tempo limite precisam ser medidos, não copiados de publicidade.

## Alternativas para substituir a conexão atual

Preços padrão consultados em 17/10/2026, em dólares por milhão de tokens. Entrada e saída são cobradas separadamente. Não são medições de qualidade ou velocidade no nosso Jarvis.

| Conexão | Modelo de referência | Entrada / saída | Encaixe no projeto |
| --- | --- | --- | --- |
| OpenAI direta | GPT-5.4 Mini | US$ 0,75 / US$ 4,50 | O projeto já tem adaptador direto. Suporta chamadas de ferramentas e saída estruturada. Candidato para comparar qualidade; exige credencial e faturamento disponíveis. |
| Groq direta | GPT-OSS 120B ou 20B | 120B: US$ 0,15 / US$ 0,60; 20B: US$ 0,075 / US$ 0,30 | Candidatos de baixo custo. Suportam ferramentas; a documentação não lista chamadas paralelas para esses dois modelos. Validar respostas, schemas e latência completa. |
| Google direta | Gemini 3.1 Flash-Lite | US$ 0,25 / US$ 1,50 | Remove o Fly mantendo o modelo atual. Possui endpoint compatível com OpenAI, mas continuar com o mesmo modelo não prova melhoria de compreensão. |
| OpenRouter gerenciado | Modelo e provedores a escolher | Preço do modelo; taxa na compra de créditos | Mantém uma API para vários provedores sem administrar nosso servidor Fly. Requer escolher modelos/provedores compatíveis e testar as ferramentas. Continua sendo uma dependência de gateway, agora gerenciada por terceiros. |

Fontes: [OpenAI — modelo e recursos](https://developers.openai.com/api/docs/models/gpt-5.4-mini), [Groq — catálogo e preços](https://console.groq.com/docs/models), [Groq — ferramentas](https://console.groq.com/docs/tool-use/overview), [Google — preços](https://ai.google.dev/gemini-api/docs/pricing), [Google — compatibilidade](https://ai.google.dev/gemini-api/docs/openai), [OpenRouter — preços](https://openrouter.ai/pricing) e [roteamento por capacidade](https://openrouter.ai/docs/guides/routing/provider-selection).

Exemplo de orçamento: mil chamadas de modelo, cada uma com 5.000 tokens de entrada e 500 de saída, custariam aproximadamente US$ 6,00 no GPT-5.4 Mini, US$ 1,05 no Groq 120B, US$ 0,525 no Groq 20B ou US$ 2,00 no Gemini 3.1 Flash-Lite. Exclui cache, ferramentas adicionais, impostos e taxas de intermediários. Um turno do Jarvis pode fazer várias chamadas; mil chamadas não equivalem a mil pedidos do usuário.

Cerebras também é uma candidata para uma segunda rodada, mas a página de preços consultada não expôs sua tabela completa em texto; não foi incluído um preço como se estivesse confirmado. [Página oficial](https://www.cerebras.ai/pricing).

## Recomendação e sequência de execução

1. Recuperar acesso autenticado ao Fly e consultar os eventos/logs para explicar o HTTP 503. O aviso não deve ser escondido como se o serviço estivesse saudável.
2. Separar a saúde do gateway, do catálogo e da geração. Distinguir indisponibilidade confirmada de consulta inconclusiva, sem transformar falha em sucesso.
3. Comparar OpenAI direta e Groq direta com os mesmos cenários reais: criar aviso original sem data de envio, revisar texto pelo contexto, resolver turma real, agendar explicitamente, consultar agenda e lidar com erro do provedor. Medir acerto, argumentos inválidos, tempo total, tempo até a primeira resposta e custo por pedido.
4. Preferência arquitetural: conexão direta primária e uma segunda conexão independente para contingência, com configurações próprias de endereço, chave e modelo. Selecionar o primário pelos resultados; o adaptador OpenAI existente facilita o primeiro teste, e Groq é uma candidata econômica para comparação/contingência.
5. Cobrir composição, conteúdo educacional e resumo com a mesma política de conexão; não limitar a melhoria ao primeiro passo do agente. Na retomada de ações já aprovadas, preservar a execução persistida para evitar duplicações.
6. Avaliar Jev como classificador opcional em paralelo ao fluxo atual, e só permitir que ele reduza ferramentas/contexto depois de demonstrar acerto nos casos do projeto. Se falhar, a IA generativa continua atendendo.

Nesta análise não foram feitas chamadas pagas de geração às APIs alternativas, não foi testada a qualidade do Jev e não houve troca de chaves, modelos ou publicação. O resultado é um diagnóstico reproduzido do gateway e uma comparação documental, com implementação e validação ao vivo ainda pendentes.
