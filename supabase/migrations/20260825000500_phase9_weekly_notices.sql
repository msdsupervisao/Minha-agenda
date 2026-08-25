-- MINHA-AGENDA — Fase 9: três modelos semanais de aviso por turma.
-- As colunas permanecem protegidas pelas policies RLS já existentes em classes.

alter table public.classes
  add column whatsapp_group text,
  add column notice_template_direct text,
  add column notice_template_motivational text,
  add column notice_template_impactful text;

alter table public.classes
  add constraint classes_whatsapp_group_length
    check (whatsapp_group is null or char_length(whatsapp_group) <= 200),
  add constraint classes_notice_direct_length
    check (notice_template_direct is null or char_length(notice_template_direct) between 1 and 4000),
  add constraint classes_notice_motivational_length
    check (notice_template_motivational is null or char_length(notice_template_motivational) between 1 and 4000),
  add constraint classes_notice_impactful_length
    check (notice_template_impactful is null or char_length(notice_template_impactful) between 1 and 4000);

-- Instala o conjunto inicial para as contas que já existem. Os textos podem ser
-- alterados depois em Turmas; o comando de voz sempre usa a versão salva.
insert into public.classes (
  user_id, name, course, schedule, teacher, notes, whatsapp_group,
  notice_template_direct, notice_template_motivational, notice_template_impactful
)
select
  users.id, seed.name, seed.course, null, null,
  'Modelos iniciais de aviso semanal.', seed.whatsapp_group,
  seed.direct_message, seed.motivational_message, seed.impactful_message
from auth.users as users
cross join (values
  (
    'Design Gráfico',
    'Designer Gráfico',
    'grupo Design',
    E'🎨 Aviso — Aula de Designer Gráfico\n\nAmanhã teremos aula de Designer Gráfico, no horário habitual. Prepare seu material e não falte!',
    E'🎨🚀 Fala, designers! Amanhã temos aula de Designer Gráfico. É mais uma oportunidade de praticar, aprender novas técnicas e transformar ideias em grandes projetos. Esperamos vocês! 🔥',
    E'⚡ Criatividade também se constrói com constância. Amanhã teremos Designer Gráfico, e cada aula amplia seu repertório e sua liberdade para criar. Não perca essa evolução! 🎨'
  ),
  (
    'Informática',
    'Informática',
    'grupo Informática',
    E'💻 Aviso — Informática\n\nAmanhã teremos aula de Informática, no horário habitual. Contamos com a presença de todos!',
    E'🚀 Amanhã é dia de avançar em Informática! Cada nova habilidade abre possibilidades para estudar, trabalhar e criar com mais autonomia. Esperamos vocês!',
    E'⚡ Tecnologia se aprende praticando. Amanhã teremos Informática; faltar significa perder uma etapa importante do conteúdo e da evolução da turma. Não faltem! 💻'
  ),
  (
    'Kids Tecnologia',
    'Kids Tecnologia',
    'grupo Kids',
    E'📢 Aviso — Kids Tecnologia\n\nOlá, famílias! Amanhã teremos aula de Kids Tecnologia, no horário habitual. Contamos com a presença das crianças!',
    E'🚀 Amanhã é dia de aprender brincando em Kids Tecnologia! Teremos novas descobertas, criatividade e muita tecnologia. Esperamos nossos pequenos para mais uma aula especial!',
    E'✨ Cada encontro ajuda a criança a desenvolver criatividade, raciocínio e confiança. Amanhã teremos Kids Tecnologia; não deixe seu pequeno perder essa etapa da nossa jornada!'
  )
) as seed(name, course, whatsapp_group, direct_message, motivational_message, impactful_message)
where not exists (
  select 1
  from public.classes existing
  where existing.user_id = users.id
    and lower(coalesce(existing.course, existing.name)) = lower(seed.course)
);
