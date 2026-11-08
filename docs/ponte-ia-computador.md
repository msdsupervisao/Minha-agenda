# Ponte da IA no computador — piloto

Esta integração ainda precisa de validação ponta a ponta em um Supabase de teste e em um celular Android. Ela fica desligada por padrão (`AGENT_BRIDGE_ENABLED=false`). Não aplique a migration nem ative em produção antes desses testes.

Quando ativada, a página autenticada cria um pedido identificado por UUID na fila do Supabase. Um processo no Windows entra na mesma conta, reserva o pedido e executa o agente. O OpenCode apenas propõe ações; as ferramentas da agenda validam, executam e conferem o resultado. Uma ação que exige confirmação permanece pendente até a pessoa confirmar na página. A ponte usa a sessão do usuário, não a chave de serviço do Supabase.

O computador precisa estar ligado, sem suspensão, com internet e a ponte aberta. A tela mostra se recebeu um sinal recente da ponte; isso não confirma que um pedido foi concluído. A tela pode retomar uma consulta após uma falha de rede. Se o primeiro envio não chegou ao servidor, o navegador reapresenta o mesmo pedido com o mesmo identificador. Para isso, o texto fica temporariamente no armazenamento local do navegador até o servidor confirmar o recebimento. Um pedido que já começou não é repetido automaticamente: se a ponte morrer durante uma ação, o estado pode permanecer `running`. Confira os registros antes de tentar novamente; não há ainda uma tela para resolver esse estado.

## Preparação para teste isolado

1. Prepare um projeto Supabase **de teste e vazio**, com as migrations anteriores e `20261106000100_agent_bridge_jobs.sql`. O comando `node scripts/prepare-bridge-test.mjs` gera `.runtime/bridge-test/preparar-banco-de-teste.sql`, com as migrations em uma transação e uma proteção contra uso em banco com tabelas existentes.
2. Configure a URL e a chave pública de teste em `.env.bridge-test.local`. Para a aplicação web, use um ambiente isolado; **não** carregue por acidente os segredos de `.env.local`, que pode apontar para a agenda em uso. Habilite `AGENT_BRIDGE_ENABLED=true` apenas nesse ambiente web e reinicie o aplicativo.
3. No Windows, rode `powershell -ExecutionPolicy Bypass -File scripts/iniciar-ponte.ps1 -EnvironmentFile .env.bridge-test.local`. Informe a conta de teste; a senha é solicitada sem exibição e não é gravada pelo script. Mantenha a janela aberta.
4. Teste um gasto fictício, um lembrete e um aviso de turma, com uma conta e turma de teste. Para o aviso, confirme a abertura do app Android, o ACK e o toque para abrir o WhatsApp; não envie mensagem real durante o teste.
5. Teste queda de conexão e reinício do PC, verifique que os pedidos não se duplicam e teste isolamento entre duas contas. Valide o SQL/RLS em banco real de teste; os testes locais não substituem essa etapa.

O modelo padrão é `opencode/glm-5.3-flash-free`. O OpenCode precisa estar instalado e autenticado conforme sua configuração; modelos gratuitos têm limites e podem deixar de estar disponíveis. O serviço do OpenCode pode guardar sessões conforme sua própria política; não trate o arquivo temporário apagado como garantia de que não há histórico no provedor. Os dados enviados ao modelo podem incluir o pedido e contexto necessário da agenda.

Para testar o Claude Code com o login local, defina `BRIDGE_PROVIDER=claude` no ambiente antes de iniciar a ponte. O modelo padrão nesse modo é `haiku`; é necessário ter o Claude Code instalado e autenticado. O uso consome a cota da assinatura, sujeita aos limites do serviço. Não é uma ativação para uso diário: ainda é preciso concluir a validação no celular.

O agendamento Android de mensagens exige que o aparelho resgate e confirme o handoff. Lembretes comuns ainda dependem da configuração existente de entrega de notificações, de um agendador externo ativo e do teste real no aparelho. O aceite do serviço de push não comprova que a notificação foi exibida pelo Android. A sincronização da Agenda Rápida ainda não foi implementada nesta etapa.

## Verificações locais

Os testes automatizados incluem a migration executada em um PostgreSQL isolado com PGlite, isolamento entre duas contas, deduplicação, retomada após queda e aprovação antes da execução. Um teste integra fila SQL, worker e agente com armazenamento e modelo simulados. Esses testes não substituem um teste real de autenticação/Supabase, nem o recebimento de notificações no aparelho.

## Projeto de teste remoto

As 12 migrations foram aplicadas somente ao projeto de teste `kdublfvsooxvrlmcichs`, por uma consulta transacional da Management API. Uma segunda consulta transacional confirmou o isolamento entre duas contas fictícias, a deduplicação e a aprovação; foi revertida ao final. Um teste adicional usou uma conta fictícia autenticada e um modelo simulado para percorrer o Supabase, a fila e o agente: gasto, lembrete e aviso foram verificados, e a conta e os dados fictícios foram removidos. Nenhuma mensagem foi enviada.

A consulta direta não registra as versões das migrations no histórico da CLI. Antes de usar `supabase db push` nesse projeto de teste, alinhe o histórico; não suponha que ele corresponde aos arquivos locais.

No teste com OpenCode, o GLM e outros modelos gratuitos retornaram limite de uso. O Nemotron tentou usar uma ferramenta bloqueada ao receber o contexto completo, e a ponte recusou o resultado.

Com Claude Code autenticado no computador, o teste real no Supabase passou para gasto, lembrete e aviso, incluindo confirmação antes do agendamento e verificação contra duplicação. A conta fictícia foi removida e a ausência de contas de teste foi verificada. Esse teste não incluiu navegador ou celular: notificações Android e abertura do WhatsApp ainda precisam ser verificadas antes do uso diário.
