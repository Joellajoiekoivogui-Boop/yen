# YEN Career Bridge

Plateforme de gestion des talents et d'insertion professionnelle du **Youth Engineers Network (YEN)** — Guinée.
Elle permet d'identifier les talents, de renforcer les compétences et de faciliter l'accès au stage et à l'emploi,
avec des analyses explicables et des décisions qui restent toujours humaines.

- **Candidats** : profil, CV PDF privé, évaluations, compétences démontrées vs déclarées, métiers compatibles, offres, candidatures, plan de progression, assistant IA.
- **Équipe YEN** : répertoire des talents, fiche candidat (12 onglets), classement intelligent par offre, présélection, corrections, catalogue, partenaires, placements, rapports, audit.
- **Partenaires** : offres validées par YEN, candidatures reçues, profils partagés avec consentement, retours sur les compétences.

## Démarrage rapide

```bash
npm install
cp .env.example .env.local          # renseigner l'URL et les clés Supabase
supabase link --project-ref <ref>   # ou : supabase start (local, Docker)
supabase db push                    # migrations (supabase/migrations)
psql "$DATABASE_URL" -f supabase/seed.sql   # catalogue (15 domaines…)
npm run admin:create -- --email vous@yen.org --role super_admin --first Prénom --last Nom
npm run dev                         # http://localhost:3000
```

Guide complet : [docs/INSTALLATION.md](docs/INSTALLATION.md).

## Pile technique

Next.js 16 (App Router, TypeScript strict) · Tailwind CSS 4 · Lucide · Supabase (PostgreSQL, Auth, Storage, RLS) ·
Zod · React Hook Form · Recharts · pdf-lib / unpdf · SDK Anthropic (couche d'abstraction serveur) · Vitest · Playwright.

## Documentation

| Document | Contenu |
|---|---|
| [docs/INSTALLATION.md](docs/INSTALLATION.md) | Installation, configuration Supabase, premier administrateur, données de démo |
| [docs/INTEGRATIONS.md](docs/INTEGRATIONS.md) | Fournisseur IA, antivirus, e-mail/SMS/WhatsApp — ce qui reste à configurer |
| [docs/MODULES.md](docs/MODULES.md) | Architecture et description de chaque module |
| [docs/SECURITE.md](docs/SECURITE.md) | Rôles, permissions, RLS, stockage, audit, sauvegardes, suppression des données |
| [docs/DEPLOIEMENT.md](docs/DEPLOIEMENT.md) | Déploiement Vercel + Supabase, check-list de production |
| [docs/TESTS.md](docs/TESTS.md) | Tests unitaires, tests RLS sur PostgreSQL, tests de bout en bout |
| [docs/ETAT.md](docs/ETAT.md) | Fonctionnalités terminées, limites connues, intégrations en attente de clés |

## Scripts

| Commande | Rôle |
|---|---|
| `npm run dev` / `build` / `start` | Développement / build / production |
| `npm run lint`, `npm run typecheck` | Qualité du code |
| `npm test` | Tests unitaires (moteur de compatibilité, correction, PDF, traçabilité IA…) |
| `npm run test:db` | Tests RLS et triggers sur un vrai PostgreSQL (`TEST_DATABASE_URL`) |
| `npm run test:e2e` | Pages publiques et protections d'accès (bureau + mobile) |
| `npm run test:e2e:parcours` | Parcours complet candidat → YEN → partenaire sur pile Supabase locale |
| `npm run seed:build` | Régénère `supabase/seed.sql` depuis `supabase/seed-data/catalog.ts` |
| `npm run seed:demo` / `seed:demo:reset` | Crée / supprime le jeu de démonstration **fictif** |
| `npm run admin:create` | Crée un compte du personnel avec un rôle (aucun mot de passe par défaut) |

## Principes non négociables

- Aucune donnée fictive présentée comme réelle : la démo est marquée `is_demo`, exclue des statistiques par défaut et signalée partout.
- Une compétence déclarée ou mentionnée dans un CV n'est jamais considérée comme démontrée ; un questionnaire n'attribue jamais le niveau expert.
- Le score de compatibilité est une estimation explicable, pas une probabilité d'embauche ; les données manquantes sont signalées, pas comptées pour zéro en silence.
- Aucune caractéristique sensible n'entre dans le classement. Aucune décision de recrutement automatique.
- Sans clé configurée, l'IA est désactivée proprement : aucun résultat n'est simulé.
