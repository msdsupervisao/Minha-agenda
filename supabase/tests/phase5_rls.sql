-- Execute após `supabase db reset` com pgTAP disponível.
begin;
select plan(5);

select ok((select relrowsecurity from pg_class where oid = 'public.expenses'::regclass), 'RLS ativo em expenses');
select ok((select relrowsecurity from pg_class where oid = 'public.reminders'::regclass), 'RLS ativo em reminders');
select ok((select relrowsecurity from pg_class where oid = 'public.contacts'::regclass), 'RLS ativo em contacts');
select is((select count(*)::int from pg_policies where schemaname = 'public' and policyname like 'owner_%'), 44, 'quatro policies por tabela');
select is((select count(*)::int from information_schema.role_table_grants where table_schema = 'public' and grantee = 'anon' and privilege_type in ('SELECT','INSERT','UPDATE','DELETE')), 0, 'anon não possui acesso às tabelas pessoais');

select * from finish();
rollback;
