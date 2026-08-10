# Collecte

Petite appli web locale de collecte de données — un « carnet de terrain » numérique.

## Fonctionnalités

- **Questions** : composer le questionnaire — ajouter autant de questions que voulu,
  chacune avec un type de réponse : **texte libre** (input simple), **choix unique**
  (radio) ou **choix multiples** (checkbox). Réordonner, modifier, supprimer,
  marquer comme obligatoire.
- **Formulaire** : saisir une réponse au questionnaire (une soumission = une ligne
  de données), avec validation des champs obligatoires.
- **Données** : tableau de bord — compteurs, distribution des réponses par option
  (barres), liste des réponses libres, table des données brutes, export **JSON**
  et **CSV** (séparateur `;`, compatible Excel FR).

## Stack

- Vite + React 18 + TypeScript, zéro dépendance UI (exceljs et supabase-js
  chargés à la demande).
- Persistance : **offline-first** — `localStorage` (clés `collecte.questions.v1`,
  `collecte.submissions.v1`, `collecte.presets.v1`) + synchronisation Supabase
  optionnelle (voir ci-dessous). Sans configuration Supabase, l'app reste 100 %
  locale.

## Base de données (Supabase)

1. Créer un projet sur [supabase.com](https://supabase.com) (plan gratuit).
2. SQL Editor → New query → coller et exécuter `supabase/schema.sql`.
3. Copier `.env.example` en `.env` et remplir :
   - `VITE_SUPABASE_URL` (Project Settings → Data API → Project URL)
   - `VITE_SUPABASE_KEY` (Project Settings → API Keys → **Publishable key** —
     jamais la secret/service_role)
4. Relancer `npm run dev` — le pied de page passe à « ☁ Synchronisé ».

Fonctionnement : au démarrage l'app tire la base et fusionne (questions de la
base prioritaires, soumissions = union par id) ; chaque mutation est écrite en
local puis poussée en tâche de fond. Hors ligne, tout est conservé en local et
resynchronisé au prochain enregistrement ou rechargement.

⚠️ Les policies RLS de `schema.sql` sont permissives (usage personnel). Avant
une mise en ligne publique : activer Supabase Auth et restreindre les policies
(voir commentaires dans le fichier SQL).

## Déploiement

Build statique : `npm run build` → `dist/`. Sur Vercel/Netlify/Render static,
poser les deux variables `VITE_SUPABASE_*` dans les env vars du projet AVANT le
build (elles sont inlinées au build).

## Lancer

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # vérification TypeScript + build de production
```

## Pistes suites possibles

- Backend + base pour multi-poste / multi-enquêteur.
- Multi-questionnaires (plusieurs formulaires nommés).
- Types supplémentaires : nombre, date, échelle 1–5.
