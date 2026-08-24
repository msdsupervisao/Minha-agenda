# Fase 6 — telas operacionais e turmas

## Entrega

- `/hoje` reúne atrasados, itens do dia, itens sem data e próximos compromissos;
- `/agenda` combina lembretes, tarefas e eventos em ordem cronológica;
- `/financas` consulta gastos por período e categoria;
- `/ajustes` mostra conta, fuso, provider de IA e configuração de notificações;
- `/turmas` oferece criação, edição, listagem e exclusão lógica de turmas.

As telas usam Server Components para leitura e Server Actions para mutações. Todas as consultas remotas passam pela sessão autenticada e pelo RLS do Supabase.

O navegador sincroniza seu identificador IANA de fuso em um cookie validado. Páginas e Server Actions recebem esse fuso explicitamente, mantendo agrupamentos, filtros e campos `datetime-local` no relógio do dispositivo.

## Banco e validação

A migration `20260820000200_phase6_classes.sql` cria `classes`, índices e quatro policies por proprietário. A suíte cobre CRUD, isolamento entre usuários, filtros de tempo, agrupamento da agenda e estado vazio.

## Limites

Turmas ainda são registros independentes. Matrículas, presença, horários recorrentes e vínculo de alunos não fazem parte desta fase.
