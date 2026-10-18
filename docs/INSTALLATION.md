# Installation et configuration

## 1. Prérequis

- Node.js ≥ 20.9 (testé avec Node 22) et npm.
- Un projet Supabase (cloud) **ou** la CLI Supabase avec Docker pour un environnement local.
- `psql` (facultatif, pour appliquer le catalogue manuellement).

```bash
npm install
cp .env.example .env.local
```

## 2. Configuration Supabase

### 2.1 Créer le projet et récupérer les clés

Dans le tableau de bord Supabase → *Project Settings → API* :

| Variable | Valeur |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | URL du projet |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | clé publique (« publishable » ou « anon ») |
| `SUPABASE_SECRET_KEY` | clé secrète (« secret » ou « service_role ») — **serveur uniquement** |

### 2.2 Appliquer les migrations

```bash
supabase link --project-ref <ref-du-projet>
supabase db push
```

Les migrations (`supabase/migrations/`) sont versionnées et rejouables dans l'ordre :

| Fichier | Contenu |
|---|---|
| `…0001_foundation_identity.sql` | types, profils, rôles, permissions, paramètres, limitation de débit |
| `…0002_catalog.sql` | domaines, compétences (critères observables), métiers |
| `…0003_candidates.sql` | profils candidats, parcours, documents, consentements, trigger d'inscription |
| `…0004_assessments_ai.sql` | évaluations, tentatives, preuves de compétences, analyses et recommandations IA |
| `…0005_partners_pipeline.sql` | organisations, offres, candidatures, entretiens, partages, placements, notifications, notes, audit |
| `…0006_rls_policies.sql` | politiques Row Level Security de toutes les tables |
| `…0007_storage_reporting.sql` | bucket privé des CV + politiques de stockage, statistiques et rapport d'insertion |
| `…0008_offer_organizations_view.sql` | informations minimales des employeurs visibles par les candidats |

### 2.3 Charger le catalogue de référence

```bash
psql "<chaîne de connexion postgres>" -f supabase/seed.sql
```

(ou automatiquement avec `supabase db reset` en local). Le seed est **idempotent** : 15 domaines, 104 compétences avec
critères observables par niveau, 47 métiers, 16 évaluations publiées (67 questions). Pour le modifier :
éditer `supabase/seed-data/catalog.ts` puis `npm run seed:build`. Le catalogue reste administrable depuis l'interface.

### 2.4 Authentification (Supabase → *Authentication*)

- **URL Configuration** : *Site URL* = URL publique de l'application ; *Redirect URLs* : `https://votre-domaine/auth/callback`.
- **Email** : activer *Confirm email* (vérification de l'adresse). Configurer un SMTP (*Settings → SMTP*) pour la production.
- **Password** : longueur minimale 10, exigences « lettres minuscules, majuscules et chiffres » (aligné sur l'application).
- **Rate limits** : conserver les limites par défaut (l'application ajoute sa propre limitation par IP et par e-mail).
- Modèles d'e-mail : les liens par défaut fonctionnent (`/auth/callback` gère le flux PKCE et `token_hash`).

### 2.5 Stockage

La migration 7 crée le bucket privé `candidate-documents` (PDF uniquement, 10 Mo max). Vérifier dans *Storage*
qu'il est bien **privé**. La limite applicative (5 Mo par défaut) se règle dans *Administration → Paramètres*.

## 3. Premier administrateur

Il n'existe **aucun compte administrateur par défaut**. Créer le premier administrateur principal :

```bash
npm run admin:create -- --email admin@yen.org --role super_admin --first Prénom --last Nom
```

Le mot de passe temporaire est affiché une seule fois (ou fourni via `ADMIN_PASSWORD`). Alternative SQL :
`scripts/grant-role.sql` après création du compte via l'inscription. Ensuite, l'administrateur attribue les autres
rôles depuis *Administration → Utilisateurs et rôles* (responsable d'insertion, évaluateur, gestionnaire de partenaires).

## 4. Données de démonstration (facultatif)

```bash
npm run seed:demo          # 6 candidats, 1 organisation, 1 recruteur, 2 offres — tous FICTIFS
npm run seed:demo:reset    # suppression complète
```

Comptes en `@demo.yen-career-bridge.invalid`, noms suffixés « (démo) », lignes marquées `is_demo`. Les tableaux de bord
les excluent par défaut ; un bandeau les signale lorsqu'ils sont inclus. Le script refuse de s'exécuter si
`NODE_ENV=production` sans `--allow-production`.

## 5. Lancer

```bash
npm run dev        # développement
npm run build && npm start   # production locale
```

## 6. Générer les types de base (facultatif)

Les requêtes utilisent des types locaux. Pour générer les types complets : `npm run db:types` (CLI Supabase requise).
