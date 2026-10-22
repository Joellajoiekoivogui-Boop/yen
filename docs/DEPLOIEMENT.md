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

**Rapidité — réglage indispensable** : les fonctions Vercel doivent tourner dans la même région que la base Supabase,
sinon chaque page traverse l'océan plusieurs fois (Vercel place les fonctions à Washington par défaut).
Région Supabase : *Project Settings › General › Region*. Région Vercel : *Settings › Functions › Function Region*.

| Région Supabase | Région Vercel |
| --- | --- |
| West EU (Paris) — eu-west-3 | Paris, France (cdg1) |
| West EU (Ireland) — eu-west-1 | Dublin, Ireland (dub1) |
| West EU (London) — eu-west-2 | London, England (lhr1) |
| Central EU (Frankfurt) — eu-central-1 | Frankfurt, Germany (fra1) |
| East US (North Virginia) — us-east-1 | Washington, D.C., USA (iad1) |

Garder aussi **Fluid Compute** activé (*Settings › Functions*) : moins de démarrages à froid après une période sans visite.
Durée d'exécution : les analyses IA peuvent prendre jusqu'à `AI_TIMEOUT_MS` ; sur Vercel, prévoir une durée maximale
des fonctions suffisante (plan adapté).

## Autre hébergement (Node.js)

```bash
npm ci && npm run build && npm start   # port 3000 ; placer derrière un proxy HTTPS
```

Le proxy Next.js (`src/proxy.ts`) s'exécute dans le runtime Node.js. Prévoir HTTPS (HSTS est envoyé).

## Connexion avec Google (facultative)

Le bouton « Continuer avec Google » apparaît automatiquement sur la connexion et l'inscription
candidat dès que le fournisseur Google est activé dans Supabase (sinon il reste masqué).
Aucune variable d'environnement à ajouter dans Vercel : l'identifiant et le secret Google restent dans Supabase.

1. Google Cloud Console : créer (ou choisir) un projet, configurer l'écran de consentement OAuth
   (type « Externe », nom de l'application, e-mail d'assistance, domaine du site).
2. *API et services › Identifiants › Créer des identifiants › ID client OAuth*, type **Application Web**.
   - Origines JavaScript autorisées : `http://localhost:3000` (développement) et le domaine de production.
   - URI de redirection autorisés : l'URL **Callback URL** affichée par Supabase
     (*Authentication › Sign In / Providers › Google*), copiée telle quelle.
3. Supabase › *Authentication › Sign In / Providers › Google* : activer, coller l'ID client et le secret client, enregistrer.
4. Supabase › *Authentication › URL Configuration* : Site URL = domaine de production ; Redirect URLs :
   `https://<domaine>/auth/callback**` et `http://localhost:3000/auth/callback**`.
5. `NEXT_PUBLIC_SITE_URL` (Vercel) doit être le domaine de production : c'est l'adresse de retour envoyée à Supabase.

Fonctionnement : `/auth/google` démarre la connexion côté serveur (vérificateur PKCE en cookie httpOnly),
`/auth/callback` échange le code contre une session, refuse un compte désactivé, reprend le prénom et le nom
du compte Google et enregistre l'acceptation des conditions. Un nouveau compte Google devient un compte
candidat ; le téléphone, obligatoire, est demandé ensuite. Un compte existant avec la même adresse e-mail
(confirmée) est relié automatiquement par Supabase et garde ses rôles (administrateur compris).

## Authentification : réglages Supabase à vérifier

Dans le tableau de bord Supabase (*Authentication*) :

1. **URL Configuration** : Site URL = `https://yen-b3vs.vercel.app` ; Redirect URLs :
   `https://yen-b3vs.vercel.app/auth/callback**` (et `http://localhost:3000/auth/callback**` en développement).
2. **E-mails** : l'expéditeur intégré de Supabase est réservé aux essais (quota très faible, adresses limitées).
   Configurez un SMTP (*Emails › SMTP Settings*, par exemple Brevo ou Resend), ou désactivez *Confirm email*
   (*Sign In / Providers › Email*) : sinon une partie des inscriptions et des réinitialisations échoue.
3. **Modèles d'e-mail** (pour que les liens marchent aussi ouverts sur un autre appareil que celui de la demande) :
   - *Confirm signup* : lien `{{ .RedirectTo }}&token_hash={{ .TokenHash }}&type=email`
   - *Reset password* : lien `{{ .RedirectTo }}&token_hash={{ .TokenHash }}&type=recovery`
4. **Mot de passe** : longueur minimale 8 (comme le site) ; protection contre les mots de passe divulgués si
   l'offre le permet.
5. **Rate Limits** : les connexions passent par le serveur, Supabase voit donc les adresses de Vercel. Si des
   utilisateurs voient « Trop de connexions en même temps » (séance de formation, par exemple), augmentez
   *Sign-ins and sign-ups* ; les tentatives par compte restent limitées par le site.
6. **Sessions** : « Déconnecter tous les appareils » prend effet sur les autres appareils au plus tard à
   l'expiration du jeton (1 heure par défaut, réglable dans *JWT Keys / Sessions*).

## Check-list de mise en production

- [ ] Migrations appliquées, catalogue chargé, bucket `candidate-documents` privé
- [ ] Confirmation des e-mails + SMTP configurés, modèles d'e-mail à `token_hash`, URL de redirection exactes
- [ ] Premier `super_admin` créé, rôles du personnel attribués
- [ ] Données de démonstration absentes (ou supprimées avec `npm run seed:demo:reset`)
- [ ] Politique de confidentialité et CGU validées par YEN
- [ ] Sauvegardes / PITR activés et restauration testée
- [ ] Clé IA configurée (facultatif) et consentements expliqués aux candidats
- [ ] Antivirus configuré (recommandé)
- [ ] `npm run lint`, `npm run typecheck`, `npm test`, `npm run test:db`, `npm run test:e2e` au vert
