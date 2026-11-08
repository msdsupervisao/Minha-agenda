# Minha Agenda — onde paramos

Atualizado em 7 de novembro de 2026.

## O que queremos fazer

Transformar a Minha Agenda em uma assistente que você possa usar principalmente pelo celular, falando naturalmente:

- **Gastos:** dizer “gastei 60 reais com combustível” e ter o gasto registrado.
- **Lembretes:** falar de um compromisso e receber uma notificação na hora certa.
- **Avisos de aula:** pedir que a agenda prepare uma mensagem para uma turma e avise no horário escolhido. Você toca na notificação, abre o WhatsApp, escolhe o grupo e envia a mensagem pessoalmente.
- **Computador:** aproveitar a Agenda Rápida, que você já usa no Windows, e futuramente sincronizá-la com a Minha Agenda.

A ideia é que o computador, ligado e conectado à internet, use uma IA pelo terminal para entender os pedidos feitos no celular. A ponte oferece OpenCode e Claude Code como alternativas à API usada atualmente.

## O que já foi feito

- Preparamos uma **ponte** para que a agenda envie pedidos ao computador e receba as respostas.
- A agenda continua responsável por validar e executar as ações; a IA apenas sugere o que fazer.
- Criamos uma fila para identificar os pedidos e evitar repetições automáticas quando uma execução for interrompida.
- Preparamos o fluxo de confirmação antes de agendar um aviso de turma.
- Acrescentamos ao agente a ferramenta de registro de gastos, com verificação do registro.
- Testamos o modelo gratuito **GLM-5.3-Flash Free pelo OpenCode**. Com dados fictícios, ele conseguiu registrar um gasto, criar um lembrete e preparar um aviso de turma, aguardando confirmação.
- Testamos a fila em um banco isolado no computador. Passaram os testes de separação entre usuários, pedidos repetidos, reserva do pedido e confirmação.
- Ligamos o campo de lembrete rápido à ponte quando ela estiver ativada e acrescentamos um indicador de sinal do computador.
- Corrigimos a recuperação após queda de internet e a marcação incorreta de lembretes como entregues quando a notificação falhava. Esses ajustes ainda precisam de teste no ambiente real.
- No projeto Supabase de teste, o Claude Code interpretou pedidos fictícios e a ponte registrou gasto e lembrete e preparou um aviso após confirmação. Os dados fictícios foram removidos. O Claude usa a cota da assinatura existente.
- Passaram 22 testes direcionados, a verificação de tipos e a compilação do projeto.

Os testes acima usaram dados fictícios. Nenhuma mensagem foi enviada pelo WhatsApp e nenhuma das ações de teste foi registrada na sua agenda real.

## Onde paramos

**A ponte ainda não está ativada na agenda publicada.** Antes de usá-la no dia a dia, precisamos:

1. Continuar a validação da ponte no projeto Supabase de teste `kdublfvsooxvrlmcichs`, sem usar a agenda real.
2. Testar o caminho completo entre o celular e o computador ligado.
3. Confirmar em um celular Android real o recebimento de lembretes, o agendamento do aviso e a abertura do WhatsApp com a mensagem pronta.
4. Sincronizar a Agenda Rápida com a Minha Agenda, preservando as demandas que já existem.

O teste local no computador ajuda a verificar a fila, mas não substitui o teste completo pela internet e no celular.

## Sobre criar outra conta Supabase

Você já criou um projeto separado no Supabase. Instalamos nele a estrutura necessária e verificamos as permissões usando contas fictícias; os dados de teste são apagados depois. A ponte continua desligada na agenda publicada.

## Como retomar

Ao voltar, você pode dizer:

> Continue a Minha Agenda de onde paramos. Leia o arquivo LEIA-AQUI-CONTINUIDADE.md e me explique o próximo passo.

Detalhes técnicos adicionais: `docs/ponte-ia-computador.md`.
