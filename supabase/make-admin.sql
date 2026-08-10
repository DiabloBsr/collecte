-- Amorçage : promeut TON compte en administrateur (à faire UNE seule fois,
-- après avoir créé ton compte). Remplace l'email puis exécute dans SQL Editor.
-- Les admins suivants se créent ensuite depuis la page Admin de l'app.
update auth.users
set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || '{"role":"admin"}'::jsonb
where email = 'TON_EMAIL_ICI';

-- Vérification (doit afficher ton email avec role admin) :
select email, raw_app_meta_data->>'role' as role from auth.users;
