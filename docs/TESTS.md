# Tests

| Suite | Commande | Couverture |
|---|---|---|
| Unitaires (Vitest) | `npm test` | moteur de compatibilité (données manquantes, pondération, exigences obligatoires, caractéristiques sensibles), correction des évaluations (falsification d'options, plafonnement du niveau, correction humaine), contrôle des PDF (faux PDF, exécutable renommé, JavaScript, taille), complétion, compétences démontrées, traçabilité IA |
| Base de données | `TEST_DATABASE_URL=postgres://postgres@localhost:5432/postgres npm run test:db` | 40 tests RLS/triggers sur un vrai PostgreSQL 16 : inscription et rôles, isolation des candidats, clés d'évaluation, notes internes, audit, partenaires et consentement, stockage, accès anonyme, rapport d'insertion |
| Bout en bout (public) | `npm run test:e2e` | pages publiques, catalogue, protections d'accès, en-têtes de sécurité, absence de défilement horizontal (bureau et mobile) |
| Bout en bout (parcours) | `npm run test:e2e:parcours` | inscription → profil → consentements → compétences → évaluation corrigée → CV (faux PDF refusé, URL signée) → candidature ; YEN : fiche, note interne, preuves, transmission au partenaire, audit, rapports ; partenaire : accès limité, aucune coordonnée ni note interne |

## Base de données de test

Les tests `tests/db` créent une base temporaire, appliquent une émulation minimale de Supabase
(`tests/db/supabase-stub.sql` : rôles, `auth.uid()`, schéma `storage`), toutes les migrations et le catalogue, puis la
suppriment. N'importe quel PostgreSQL 16 accessible avec un superutilisateur convient.

## Pile Supabase locale sans Docker (parcours complet)

`tests/e2e-stack/start.sh` démarre GoTrue (auth) et PostgREST (binaries officiels), une passerelle Node qui reproduit le
routage Supabase et émule le stockage en appliquant les politiques RLS de `storage.objects`, puis affiche les clés :

```bash
BIN_DIR=/chemin/vers/binaires PG_ADMIN_URL=postgres://postgres@localhost:5432/postgres ./tests/e2e-stack/start.sh
# reporter les clés affichées dans .env.local (URL http://localhost:54321), puis :
ADMIN_PASSWORD=... npm run admin:create -- --email admin@yen.test --role super_admin
DEMO_PASSWORD=... npm run seed:demo
npm run build && npm start
E2E_ADMIN_PASSWORD=... E2E_DEMO_PASSWORD=... npm run test:e2e:parcours
./tests/e2e-stack/reset-rate-limits.sh   # entre deux exécutions (la limitation anti-force brute s'applique)
```

Avec Docker, `supabase start` fournit une pile équivalente et complète (dont le vrai service Storage).
