-- MINHA-AGENDA — Fase 10: histórico curto das sugestões de aviso geradas por IA.
-- O histórico permite pedir novidade sem alterar os três modelos aprovados pelo usuário.

alter table public.classes
  add column notice_generation_history jsonb not null default '[]'::jsonb;

alter table public.classes
  add constraint classes_notice_generation_history_array
    check (jsonb_typeof(notice_generation_history) = 'array'),
  add constraint classes_notice_generation_history_size
    check (octet_length(notice_generation_history::text) <= 100000);
