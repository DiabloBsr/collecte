-- Durcissement avant mise en ligne + temps réel.
-- À exécuter dans Supabase : SQL Editor → New query → Run.

-- 1) Accès réservé aux utilisateurs CONNECTÉS (les policies « tout le monde »
--    de la V1 sont supprimées). Les comptes se créent uniquement depuis le
--    dashboard : Authentication → Users → Add user (pas d'inscription publique).
drop policy if exists "questions_all" on public.questions;
drop policy if exists "submissions_all" on public.submissions;

drop policy if exists "questions_authenticated" on public.questions;
create policy "questions_authenticated" on public.questions
  for all to authenticated using (true) with check (true);

drop policy if exists "submissions_authenticated" on public.submissions;
create policy "submissions_authenticated" on public.submissions
  for all to authenticated using (true) with check (true);

-- 2) Temps réel : publie les changements des deux tables pour que le tableau
--    de bord des autres appareils se rafraîchisse tout seul.
do $$
begin
  begin
    alter publication supabase_realtime add table public.questions;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.submissions;
  exception when duplicate_object then null;
  end;
end $$;
