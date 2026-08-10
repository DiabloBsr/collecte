-- ══ Collecte v2 : multi-questionnaires, enquêteur, GPS, objectifs ══
-- À exécuter dans Supabase : SQL Editor → New query → Run. Idempotent.

-- 1) Table des questionnaires (enquêtes)
create table if not exists public.questionnaires (
  id         text primary key,
  name       text not null,
  goal       integer,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);
alter table public.questionnaires enable row level security;
drop policy if exists "questionnaires_authenticated" on public.questionnaires;
create policy "questionnaires_authenticated" on public.questionnaires
  for all to authenticated using (true) with check (true);

-- 2) Rattachement des questions/réponses + signature enquêteur + GPS
alter table public.questions add column if not exists questionnaire_id text;
alter table public.submissions add column if not exists questionnaire_id text;
alter table public.submissions add column if not exists collector_email text;
alter table public.submissions add column if not exists collector_name text;
alter table public.submissions add column if not exists lat double precision;
alter table public.submissions add column if not exists lng double precision;

-- 3) Type « number » (si pas déjà fait)
alter table public.questions drop constraint if exists questions_type_check;
alter table public.questions
  add constraint questions_type_check
  check (type in ('text', 'number', 'radio', 'checkbox'));

-- 4) Temps réel sur la nouvelle table
do $$
begin
  begin
    alter publication supabase_realtime add table public.questionnaires;
  exception when duplicate_object then null;
  end;
end $$;

-- 5) Les données existantes rejoignent l'enquête par défaut
insert into public.questionnaires (id, name)
  values ('q-default', 'Enquête 1')
  on conflict (id) do nothing;
update public.questions set questionnaire_id = 'q-default' where questionnaire_id is null;
update public.submissions set questionnaire_id = 'q-default' where questionnaire_id is null;
