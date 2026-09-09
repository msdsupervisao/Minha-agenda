# Correções de agendamento, contexto e clima — 2026-09-09

## Agendamentos independentes

Inspeção: o servidor já usa UUID por registro e o Android usa ID por código, não por horário. Não foi reproduzida uma sobrescrita de banco para os dois avisos relatados. A interface antiga do Android só mostrava o último resgate e não oferecia uma lista para recuperar mensagens após tocar/dispensar notificações.

APK 1.1 (versionCode 2): lista persistente de mensagens, identificação independente, resolução de colisões numéricas e processamento serial dos resgates. Cada mensagem pode ser aberta no WhatsApp em qualquer ordem e marcada como concluída pelo usuário. Abrir/compartilhar não é tratado como envio comprovado. A lista sobrevive ao fechamento do aplicativo. Notificações ainda mantidas pelo Android são importadas ao atualizar; mensagens antigas já removidas do dispositivo podem não ser recuperadas por essa importação.

No Chrome, removida a etiqueta comum de fallback nas notificações push sem ID. Etiquetas reais por lembrete continuam preservadas.

Build Android passou. APK: `mobile/android/app/build/outputs/apk/debug/app-debug.apk`. É preciso instalar a atualização no celular; deploy da Vercel não atualiza o APK. Nenhum dispositivo estava conectado ao ADB. A validação de dois alertas simultâneos no aparelho continua pendente; o código/testes comprovam independência da lista e dos IDs, não a entrega pelo sistema operacional.

## Tiozão Gamer

Removidos os fatos do prompt global. Ferramenta de leitura `get_course_knowledge` fornece os fatos sob demanda. Instruções proíbem associações genéricas entre mascotes e YouTube/jogos/conteúdo. O conhecimento continua disponível para perguntas diretas e continuações realmente relacionadas.

## Clima

Ferramenta `get_weather` usa geocodificação e previsão do [Open-Meteo](https://open-meteo.com/en/docs). Retorna temperatura, umidade, condição, precipitação e previsão de 7 dias com mínimas/máximas e probabilidade de chuva. Inclui local, fonte, instante da consulta e horário dos dados; condições atuais são estimativas meteorológicas atualizadas, não leitura de sensor local.

Cidade/estado informados pelo usuário ou localização autorizada pelo botão no Chrome. Coordenadas arredondadas para duas casas são mantidas somente na sessão da página e enviadas para a ferramenta; não há inferência de cidade pelo fuso. Ambiguidade pede esclarecimento; indisponibilidade ou dados inválidos não produzem temperatura inventada. Nome exato da cidade evita confusão com aeroportos. Endpoint gratuito destinado a uso não comercial; rever a modalidade do provedor antes de comercializar o serviço.

## Transcrição

Reconhecimento combina segmentos cumulativos do Chrome Android sem repetir versões progressivamente maiores da mesma frase. Mantidos silêncio de 3s, teto de 15s e proteção de encerramento.

## Validação

- Typecheck e 216 testes aprovados (incluindo mesmo horário, colisão de ID, push sem etiqueta, contexto, clima e transcrição).
- APK compilado com sucesso; teste físico pendente.
- Consulta real Open-Meteo para Sorriso funcionou.
- Smoke test com o agente e o gateway, ferramentas somente de leitura: pergunta sobre edição para YouTube não consultou nem citou Tiozão; pergunta direta chamou `get_course_knowledge`; temperatura chamou `get_weather` e respondeu com fonte e horário. Teste não autenticou no app nem criou tarefas reais.
- Scripts reproduzíveis: `node --import tsx scripts/check-weather-live.ts` e `node --env-file=.env.local --import tsx scripts/check-agent-features-live.ts`.

Arquivos de voz/Azure/debug e diagnóstico alterados por outro trabalho foram preservados fora deste pacote.
