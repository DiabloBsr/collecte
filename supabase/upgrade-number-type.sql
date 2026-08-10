-- Ajout du type de question « Nombre » : élargit la contrainte de type.
-- À exécuter dans Supabase : SQL Editor → New query → Run.
alter table public.questions drop constraint if exists questions_type_check;
alter table public.questions
  add constraint questions_type_check
  check (type in ('text', 'number', 'radio', 'checkbox'));
