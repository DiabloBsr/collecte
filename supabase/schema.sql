-- Schéma Collecte — à exécuter dans Supabase : SQL Editor → New query → Run.
-- Deux tables miroir des structures de l'app (ids générés côté client).
-- Les suppressions sont DOUCES (deleted_at) : un appareil resté hors ligne ne
-- peut pas ressusciter une ligne supprimée ailleurs — il voit le tombstone.

create table if not exists public.questions (
  id         text primary key,
  label      text not null,
  type       text not null check (type in ('text', 'radio', 'checkbox')),
  section    text not null default 'survey' check (section in ('identity', 'survey')),
  options    jsonb not null default '[]'::jsonb,
  required   boolean not null default false,
  position   integer not null default 0,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists public.submissions (
  id           text primary key,
  submitted_at timestamptz not null,
  answers      jsonb not null default '{}'::jsonb,
  deleted_at   timestamptz
);

-- Pour les bases créées avant l'ajout des tombstones :
alter table public.questions add column if not exists deleted_at timestamptz;
alter table public.submissions add column if not exists deleted_at timestamptz;

-- RLS activé sur les deux tables (schéma public = exposé par l'API).
alter table public.questions enable row level security;
alter table public.submissions enable row level security;

-- V1 (usage personnel) : accès complet avec la clé publiable.
-- ⚠️ AVANT une mise en ligne publique, durcir : activer Supabase Auth et
-- remplacer ces policies par des policies par rôle (ex. anon = insert-only
-- sur submissions, gestion réservée aux utilisateurs authentifiés).
drop policy if exists "questions_all" on public.questions;
create policy "questions_all" on public.questions
  for all using (true) with check (true);

drop policy if exists "submissions_all" on public.submissions;
create policy "submissions_all" on public.submissions
  for all using (true) with check (true);
