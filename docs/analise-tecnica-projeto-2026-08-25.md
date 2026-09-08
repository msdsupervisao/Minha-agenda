# Análise técnica e roadmap — Minha Agenda

Data da análise: 25 de agosto de 2026
Projeto analisado: site Minha Agenda + banco Supabase + aplicativo Android complementar

## Conclusão executiva

A base atual está boa e não deve ser refeita. O próximo salto precisa transformar a Agenda em uma central semanal confiável, reduzindo o trabalho de domingo para este fluxo:

```text
Revisar mensagens → Agendar semana → Abrir cada aviso → Escolher grupo → Enviar
```

As maiores oportunidades não estão em trocar a IA ou adicionar telas isoladas. Elas estão em:

1. Preparar a semana inteira em lote.
2. Estruturar corretamente turmas, grupos, dias e horários.
3. Dar ao aplicativo Android uma central de avisos pendentes.
4. Tornar os alarmes mais confiáveis e diagnosticáveis.
5. Registrar claramente cada etapa sem prometer confirmação de entrega do WhatsApp.

## Descoberta importante sobre o WhatsApp

Uma informação anterior precisa ser corrigida: desde junho de 2026 a Meta possui uma API oficial de grupos. Porém ela:

- exige Conta Comercial Oficial — OBA;
- cria grupos novos por convite;
- aceita no máximo 8 participantes;
- não funciona com números usados no aplicativo WhatsApp Business;
- não atende grupos escolares existentes e maiores.

Portanto, ela existe, mas não serve para as turmas atuais. O aplicativo assistido continua sendo a escolha correta.

Fonte: [API oficial de Grupos da Meta](https://developers.facebook.com/docs/whatsapp/cloud-api/groups/).

## Arquitetura recomendada

```text
Curso
 └─ Turma real / grupo do WhatsApp
     ├─ professor e público: pais ou alunos
     ├─ dias e horários estruturados
     ├─ três modelos de mensagem
     └─ antecedência padrão do aviso
                    ↓
          Planejador da semana
                    ↓
        Um único lote para o celular
                    ↓
       Central de avisos no Android
                    ↓
    Notificação → WhatsApp → confirmação manual
```

Hoje o campo de horário é apenas texto, como “quinta das 07 às 11”. Isso é suficiente para mostrar na tela, mas não é confiável para calcular automaticamente datas, aulas, feriados e avisos.

## Roadmap priorizado

| Prioridade | Melhoria | Resultado esperado |
|---|---|---|
| 1 | Planejador semanal | Preparar todos os avisos da semana em uma única tela |
| 2 | Horários estruturados | Calcular automaticamente aula e aviso do dia anterior |
| 3 | Lote único para o celular | Não abrir o aplicativo várias vezes para agendar |
| 4 | Central Android | Ver, editar, adiar e cancelar avisos pendentes |
| 5 | Diagnóstico Android | Mostrar claramente se o aviso será exato ou aproximado |
| 6 | Fluxo direto para WhatsApp | Pular a lista geral de aplicativos e abrir o WhatsApp escolhido |
| 7 | Histórico real de envio | Saber o que foi agendado, aberto e marcado como enviado |
| 8 | Aprendizado da IA | Aprender quais mensagens foram aprovadas, editadas ou rejeitadas |

## 1. Planejador da semana

A tela principal de avisos deveria abrir com algo semelhante a:

- Design Gráfico — aula quarta 7h — aviso terça 20h.
- Kids Tecnologia — aula quinta 9h — aviso quarta 20h.
- Informática — aula quinta 7h — aviso quarta 20h.

O usuário revisaria os textos e tocaria uma única vez em **Agendar semana no celular**.

Se duas mensagens estiverem programadas para o mesmo horário, como Kids e Informática às 20h, o celular poderia consolidar os avisos:

> Você tem 2 mensagens para enviar.

Depois de retornar do WhatsApp, o aplicativo apresentaria a próxima mensagem pendente.

## 2. Separar fatos da parte criativa

Professor, data e horário não deveriam ficar presos dentro do texto criativo. O modelo ideal seria:

```text
Parte criativa criada pela IA...

📅 Aula: quinta-feira, 27/08, das 09h às 11h
👨‍🏫 Professor: Fernando Padova
```

Assim, se um horário mudar, todos os avisos passam a mostrar o dado atualizado. A IA cria apenas a parte criativa e não precisa adivinhar fatos.

Também deveria existir um campo opcional **Assunto desta semana**, por exemplo:

> Photoshop — ferramentas de seleção e recorte.

Sem uma informação nova, a IA só consegue reescrever a mesma ideia. Com o assunto semanal, ela consegue produzir mensagens realmente diferentes e relevantes.

## 3. Modelo de dados sugerido

O banco pode evoluir de forma aditiva, preservando o que já existe:

```text
courses
  curso principal

class_groups
  turma real, professor, público, nome do grupo e antecedência do aviso

class_sessions
  dia da semana, início, fim, fuso horário e vigência

notice_templates
  estilo, texto, versão, origem manual/IA e estado ativo

scheduled_notices
  aula, horário do aviso, cópia congelada da mensagem e estado

notice_events
  recebido no celular, notificado, WhatsApp aberto e confirmação manual
```

A mensagem agendada deve guardar uma cópia congelada do texto. Alterar o modelo depois não deve modificar silenciosamente uma mensagem já programada.

## 4. Melhorar o aplicativo Android

O aplicativo não deveria abrir em uma tela vazia. Ele deveria mostrar:

- próximos avisos;
- data, horário e grupo indicado;
- estado “exato” ou “aproximado”;
- botões **Abrir WhatsApp**, **Adiar 10 minutos** e **Cancelar**;
- botão **Testar aviso daqui a 2 minutos**;
- último atraso medido, como “disparou 38 segundos depois”.

O Capacitor usado atualmente já oferece consulta, atualização e cancelamento de notificações pendentes. Também permite verificar e abrir diretamente a configuração de alarmes exatos. A documentação alerta que, se essa permissão for retirada, alarmes exatos já agendados podem ser apagados. Por isso o aplicativo deve manter uma lista própria e reagendá-los quando necessário.

Fonte: [Capacitor Local Notifications](https://capacitorjs.com/docs/apis/local-notifications).

Também vale testar `USE_EXACT_ALARM` no APK particular. O Android admite essa alternativa quando alarmes precisos são parte central de uma agenda ou calendário. Isso pode eliminar a dificuldade de encontrar a permissão no Xiaomi, embora não resolva todas as restrições de bateria.

Fonte: [Alarmes exatos no Android](https://developer.android.com/develop/background-work/services/alarms).

O WorkManager pode cuidar da recuperação e sincronização depois de reinício, mas não deve substituir o alarme exato: ele garante execução posterior, não pontual.

Fonte: [Trabalho persistente com WorkManager](https://developer.android.com/develop/background-work/background-tasks/persistent).

## 5. Abrir diretamente o WhatsApp

Pode ser criada uma pequena integração nativa para o usuário escolher uma vez:

- WhatsApp normal;
- WhatsApp Business.

Depois disso, ao tocar no aviso, o Android abre diretamente o aplicativo escolhido com o texto, pulando a lista geral de aplicativos. O Android permite restringir um compartilhamento a um pacote específico com `Intent.setPackage()`.

Fonte: [Referência de Intents do Android](https://developer.android.com/reference/android/content/Intent#setPackage(java.lang.String)).

Ainda será necessário escolher o grupo. Pela arquitetura do Direct Share, os atalhos de contatos e grupos são fornecidos pelo próprio WhatsApp. A Agenda não consegue selecionar silenciosamente um grupo arbitrário.

Fonte: [Direct Share no Android](https://developer.android.com/develop/ui/compose/sharing/direct-share-targets).

## 6. Criar uma caixa de saída confiável

Hoje o agendamento temporário é apagado depois que o celular confirma. Isso protege os dados, mas também elimina o histórico.

O fluxo deveria possuir estados transparentes:

```text
rascunho
→ preparado
→ recebido pelo celular
→ agendado exato/aproximado
→ notificação exibida
→ WhatsApp aberto
→ marcado manualmente como enviado
```

Não deve ser usada a palavra “entregue”, porque o aplicativo não recebe confirmação de entrega do WhatsApp.

Cada aviso precisa de um identificador fixo. Isso evita notificações duplicadas se a internet falhar depois do agendamento e o processo for repetido.

## 7. Fazer a IA aprender com o usuário

A geração atual já possui boas decisões técnicas: usa os textos salvos como referência, Structured Outputs e `store: false`.

As próximas melhorias deveriam incluir:

- **Gostei**, **Não gostei** e **Usei com alterações**;
- motivos rápidos: muito longa, formal demais, emojis demais ou repetitiva;
- preferências por turma: pais/alunos, tamanho, quantidade de emojis e assinatura;
- comparação local com mensagens anteriores;
- nova geração automática quando a semelhança ultrapassar um limite;
- limite de gerações por minuto para evitar gasto acidental;
- registro de custo, tokens e tempo também para os avisos.

Antes de trocar o modelo atual, deve ser criado um conjunto de testes usando comandos reais e mensagens aprovadas. A orientação oficial é combinar dados de produção, feedback humano e avaliação contínua.

Não é recomendável adotar agora a antiga Evals API, pois a própria OpenAI programou seu encerramento para novembro de 2026. Os testes podem ficar no próprio projeto.

Fontes: [boas práticas de avaliação da OpenAI](https://developers.openai.com/api/docs/guides/evaluation-best-practices) e [aviso sobre a Evals API](https://developers.openai.com/api/docs/guides/evals).

## 8. Segurança, APK e atualizações

Antes de expandir muito o APK, recomenda-se:

- criar uma chave definitiva de assinatura;
- produzir APK de release, não debug;
- numerar versões corretamente;
- colocar uma página **Baixar aplicativo** no site;
- continuar copiando automaticamente uma versão para a Área de Trabalho;
- mostrar no aplicativo quando houver atualização disponível.

O Android exige a mesma assinatura para aceitar atualizações sobre uma instalação existente.

Fonte: [assinatura de aplicativos Android](https://developer.android.com/studio/publish/app-signing).

Também é recomendável substituir gradualmente `minhaagenda://` por um Android App Link verificado usando o domínio do site. App Links comprovam que site e aplicativo pertencem ao mesmo responsável e reduzem o risco de outro aplicativo interceptar o link.

Fonte: [Android App Links](https://developer.android.com/training/app-links/about).

## 9. Notificação de reserva

Depois de estabilizar o aviso local, pode ser adicionado um segundo canal:

- alarme local exato como principal;
- Firebase Cloud Messaging como reserva;
- Supabase Cron verificando avisos pendentes.

O FCM de alta prioridade tenta despertar o aparelho para notificações visíveis, mas ainda depende de internet. Portanto, deve ser reserva, não substituição.

Fonte: [prioridade de mensagens no FCM](https://firebase.google.com/docs/cloud-messaging/android-message-priority).

O Supabase consegue executar tarefas a cada minuto. Já o Vercel Hobby permite cron apenas uma vez por dia e com variação de até 59 minutos, sendo inadequado para avisos pontuais.

Fontes: [Supabase Cron](https://supabase.com/docs/guides/functions/schedule-functions) e [limites do Vercel Cron](https://vercel.com/docs/cron-jobs/usage-and-pricing).

## 10. Privacidade e dados de alunos

Enquanto o sistema guardar apenas nomes de turmas, professor, horários e textos de aviso, o risco é limitado. Se futuramente forem adicionados nomes de alunos, telefones de responsáveis ou informações individuais, será necessário:

- guardar apenas os dados realmente necessários;
- controlar rigorosamente o acesso;
- definir prazo de retenção e exclusão;
- permitir exportação e correção;
- considerar o melhor interesse de crianças e adolescentes;
- não enviar dados pessoais de alunos para a IA sem necessidade.

Fontes: [Guia de Segurança da ANPD](https://www.gov.br/anpd/pt-br/assuntos/noticias/anpd-publica-guia-de-seguranca-para-agentes-de-tratamento-de-pequeno-porte) e [orientação da ANPD sobre crianças e adolescentes](https://www.gov.br/anpd/pt-br/assuntos/noticias/anpd-divulga-enunciado-sobre-o-tratamento-de-dados-pessoais-de-criancas-e-adolescentes).

## O que não fazer agora

- Não adotar robô não oficial do WhatsApp Web.
- Não transformar o site inteiro em WebView.
- Não usar WorkManager como relógio exato.
- Não implantar fila complexa de mensagens agora.
- Não migrar de modelo de IA apenas porque existe um mais novo.
- Não tentar integrar agora a API oficial de grupos: oito participantes não atendem as turmas.

## Ordem prática de implementação

1. Horários estruturados e separação entre curso, turma e grupo.
2. Planejador semanal com geração e revisão em lote.
3. Caixa de saída persistente e lote único para o Android.
4. Central Android com diagnóstico, teste, adiamento e cancelamento.
5. Abertura direta do WhatsApp normal ou Business.
6. APK definitivo assinado, App Links e atualização facilitada.
7. Feedback da IA e testes de qualidade.
8. FCM como canal de reserva.

Essa sequência entrega valor desde o início e resolve os dois problemas que mais desgastaram o desenvolvimento até agora: muitos passos manuais e falta de confiança no horário do aviso.
