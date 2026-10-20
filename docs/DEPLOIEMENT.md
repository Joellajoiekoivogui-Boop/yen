# Déploiement

## Vercel + Supabase (recommandé)

1. Créer le projet Supabase de production, appliquer les migrations (`supabase db push`) et le catalogue (`supabase/seed.sql`).
2. Configurer l'authentification (voir INSTALLATION §2.4) avec l'URL de production.
3. Importer le dépôt dans Vercel (framework Next.js détecté). Variables d'environnement (Production) :
   `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `NEXT_PUBLIC_SITE_URL`,
   et si besoin `AI_PROVIDER`, `ANTHROPIC_API_KEY`, `AI_MODEL`, `CLAMAV_SCAN_URL`.
   `SUPABASE_SECRET_KEY` est **facultative** : toutes les fonctions (évaluations, CV, notifications, vue
   partenaire…) passent par des fonctions SQL sécurisées (migration 11). Elle ne sert qu'aux fonctions d'IA
   et à la déconnexion immédiate d'un compte désactivé.
   Les variables `NEXT_PUBLIC_*` sont intégrées au build : redéployer après modification.
   Les valeurs publiques du déploiement actuel sont aussi versionnées dans `.env.production` (jamais de secret) ;
   une variable définie dans Vercel reste prioritaire. `SUPABASE_SECRET_KEY` se configure uniquement dans Vercel.
4. Déployer, puis créer le premier administrateur (`npm run admin:create` depuis un poste disposant de la clé secrète).
5. Vérifier : inscription + e-mail de confirmation, téléversement d'un CV, page *Paramètres → intégrations*.

Région : choisir une région Supabase et Vercel proches des utilisateurs (ex. Europe de l'Ouest pour la Guinée).
Durée d'exécution : les analyses IA peuvent prendre jusqu'à `AI_TIMEOUT_MS` ; sur Vercel, prévoir une durée maximale
des fonctions suffisante (plan adapté).

## Autre hébergement (Node.js)

```bash
npm ci && npm run build && npm start   # port 3000 ; placer derrière un proxy HTTPS
```

Le proxy Next.js (`src/proxy.ts`) s'exécute dans le runtime Node.js. Prévoir HTTPS (HSTS est envoyé).

## Check-list de mise en production

- [ ] Migrations appliquées, catalogue chargé, bucket `candidate-documents` privé
- [ ] Confirmation des e-mails + SMTP configurés, URL de redirection exactes
- [ ] Premier `super_admin` créé, rôles du personnel attribués
- [ ] Données de démonstration absentes (ou supprimées avec `npm run seed:demo:reset`)
- [ ] Politique de confidentialité et CGU validées par YEN
- [ ] Sauvegardes / PITR activés et restauration testée
- [ ] Clé IA configurée (facultatif) et consentements expliqués aux candidats
- [ ] Antivirus configuré (recommandé)
- [ ] `npm run lint`, `npm run typecheck`, `npm test`, `npm run test:db`, `npm run test:e2e` au vert
