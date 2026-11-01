# E-mails d'authentification : Resend + Supabase Auth

Un seul e-mail contient **un lien et un code à 6 chiffres** : l'utilisateur clique sur le lien, ou recopie le
code. Il sert à trois choses :

- **se connecter sans mot de passe** (méthode proposée par défaut sur `/connexion`) ;
- **créer un compte sans mot de passe** (candidat : l'adresse seule ; partenaire : organisation et contact) ;
- **vérifier l'adresse** d'un compte créé avec un mot de passe (la vérification reste obligatoire).

Google et le mot de passe restent disponibles. L'équipe YEN peut continuer à se connecter avec son mot de passe :
le navigateur retient ce choix.

| Qui | Fait quoi |
|---|---|
| Site (Next.js) | Appelle `supabase.auth.signInWithOtp()` (ou `signUp()` avec mot de passe), affiche `/verification` et `/auth/lien`, transmet le code ou le lien à `supabase.auth.verifyOtp({ type: "email" })`, limite les demandes et les codes erronés |
| Supabase Auth | **Génère** le lien et le code, les insère dans l'e-mail, les **vérifie** et ouvre la session |
| Resend | **Transporte** l'e-mail (serveur SMTP configuré dans Supabase), rien d'autre |

Aucune clé Resend n'est utilisée par le site : la clé se saisit **uniquement** dans le tableau de bord Supabase.

## Parcours

1. Le visiteur saisit son adresse (`/connexion`), ou s'inscrit (`/inscription`).
2. Le serveur appelle `supabase.auth.signInWithOtp()` :
   - connexion : `shouldCreateUser: false`, une adresse inconnue ne reçoit rien et aucun compte n'est créé ;
   - inscription : `shouldCreateUser: true`, avec les informations du formulaire (type de compte, organisation…).
3. Supabase envoie l'e-mail par le SMTP de Resend : modèle *Confirm signup* pour un nouveau compte
   (`supabase/templates/confirmation.html`), *Magic Link* pour un compte existant (`supabase/templates/magic-link.html`).
4. Le visiteur arrive sur `/verification` (l'adresse est retenue dans un cookie httpOnly, jamais dans l'URL).
5. Il clique sur le lien de l'e-mail (page `/auth/lien`, bouton « Continuer »), ou saisit le code.
6. Le serveur appelle `supabase.auth.verifyOtp({ type: "email" })`, avec le code ou l'empreinte du lien
   (`token_hash`). Session ouverte (cookies httpOnly), redirection vers son espace. Un nouveau candidat passe
   d'abord par « Vos coordonnées » (nom, téléphone, ville).

Pourquoi un clic sur `/auth/lien` : certaines messageries (Outlook, antivirus d'entreprise) ouvrent les liens
pour les analyser. Ouvrir la page ne vérifie rien ; seul le clic de l'utilisateur consomme le lien.

Garde-fous du site :

- **Codes erronés** : 5 par compte depuis une même adresse IP, 10 par compte toutes adresses confondues et 30 par
  adresse IP, en 15 minutes. Ces limites s'ajoutent à celles de Supabase.
- **Envois d'e-mail** (connexion, inscription, renvoi) : 3 par adresse e-mail et 30 par adresse IP en 15 minutes.
  Le renvoi est possible après le délai minimal de Supabase entre deux e-mails (60 s par défaut).
- **Pas d'énumération des comptes** : adresse inconnue à la connexion ou déjà inscrite à l'inscription, l'écran
  est le même (une adresse déjà inscrite reçoit simplement un lien de connexion).
- **Usage unique** : le lien et le code d'un même e-mail ne servent qu'une fois ; un nouvel envoi remplace le précédent.
- **Adresse préinscrite par un tiers** : à la première confirmation, un mot de passe qui n'a pas été choisi dans le
  même navigateur est remplacé par un mot de passe aléatoire (détails dans `docs/SECURITE.md`).

## 1. Resend

### 1.1 Compte

Créer un compte sur <https://resend.com> (offre gratuite : 3 000 e-mails par mois, 100 par jour).

### 1.2 Domaine d'envoi (obligatoire)

Sans domaine vérifié, Resend n'envoie qu'à l'adresse du titulaire du compte : **impossible d'écrire aux
candidats**. Il faut un nom de domaine dont YEN gère les DNS. Les adresses `*.vercel.app` ne conviennent pas.

1. *Domains › Add Domain*. Saisir de préférence un sous-domaine dédié, par exemple `mail.votre-domaine.org` : la
   réputation d'envoi reste séparée du domaine principal.
2. Choisir la région la plus proche (par exemple Irlande `eu-west-1`).
3. Resend affiche les enregistrements DNS à créer chez l'hébergeur du domaine (registrar, Cloudflare, Vercel DNS…).
   Recopier **exactement** les valeurs affichées par Resend : celles ci-dessous ne sont que des exemples.

   | Type | Nom (sous le domaine d'envoi) | Valeur (exemple) | Rôle |
   |---|---|---|---|
   | TXT | `resend._domainkey` | `p=MIGfMA0GCSq…` (clé fournie par Resend) | DKIM : signature des e-mails |
   | MX | `send` | `feedback-smtp.eu-west-1.amazonses.com`, priorité 10 | Retours (rebonds) |
   | TXT | `send` | `v=spf1 include:amazonses.com ~all` | SPF : serveurs autorisés |
   | TXT | `_dmarc` | `v=DMARC1; p=none;` | DMARC (recommandé, contre le classement en spam) |

4. Cliquer sur *Verify DNS Records*. La vérification prend de quelques minutes à 72 heures, selon l'hébergeur DNS.
   Attendre le statut **Verified**.

### 1.3 Clé d'API (mot de passe SMTP)

1. *API Keys › Create API Key* : nom `supabase-auth`, permission **Sending access**, limitée au domaine d'envoi.
2. La clé (`re_…`) ne s'affiche **qu'une fois**. La coller directement dans Supabase (étape 2.1). Elle ne doit aller
   **ni dans le code, ni dans un fichier `.env`, ni dans un message**. En cas de fuite : la supprimer dans Resend et en
   créer une autre.

### 1.4 Paramètres SMTP de Resend

| Champ | Valeur |
|---|---|
| Hôte | `smtp.resend.com` |
| Port | `465` (SSL/TLS) ; `587` (STARTTLS) en secours |
| Identifiant | `resend` |
| Mot de passe | la clé d'API créée en 1.3 |
| Adresse d'expédition | une adresse du domaine vérifié, par exemple `no-reply@mail.votre-domaine.org` |
| Nom d'expéditeur | `YEN Career Bridge` |

Selon les comptes, Resend propose aussi une intégration Supabase (*Integrations*) qui remplit ces réglages
automatiquement. Le résultat est le même.

## 2. Supabase (tableau de bord du projet)

### 2.1 SMTP personnalisé

*Authentication › Emails › SMTP Settings* : activer **Enable Custom SMTP**, puis saisir les valeurs du tableau 1.4 et
enregistrer. Si le champ « intervalle minimal entre deux e-mails » est présent, le laisser à **60 secondes**. S'il est
modifié, donner la même valeur à la variable `AUTH_RESEND_DELAY_S` du site (Vercel).

### 2.2 Confirmation des adresses et code

*Authentication › Sign In / Providers › Email* :

- **Confirm email** : activé. Ne jamais le désactiver pour contourner un problème d'envoi.
- **Email OTP Length** : `6`. Le site accepte de 6 à 10 chiffres ; 6 correspond aux textes affichés.
- **Email OTP Expiration** : `3600` secondes (1 heure) au plus ; 900 à 1800 secondes est un bon compromis.

### 2.3 Modèles des e-mails

*Authentication › Emails › Templates* :

| Modèle | Subject | Message body |
|---|---|---|
| **Confirm signup** | `Votre code de vérification YEN Career Bridge` | contenu de `supabase/templates/confirmation.html` |
| **Magic Link** | `Votre lien de connexion YEN Career Bridge` | contenu de `supabase/templates/magic-link.html` |

Supabase y remplace `{{ .Token }}` par le code, `{{ .TokenHash }}` par l'empreinte du lien et `{{ .SiteURL }}` par
l'adresse du site (*URL Configuration › Site URL*, à régler sur l'adresse de production). Le lien mène à
`/auth/lien` ; ne pas le remplacer par `{{ .ConfirmationURL }}`, qui serait consommé par les analyseurs de liens.
Le modèle *Reset password* garde son lien vers `/auth/callback` (voir `docs/DEPLOIEMENT.md`).

### 2.4 Limites d'envoi

*Authentication › Rate Limits* :

- **Rate limit for sending emails** : avec un SMTP personnalisé, la valeur par défaut est faible. La régler, par
  exemple, à 100 par heure, sans dépasser le quota de l'offre Resend (100 par jour en gratuit).
- **Rate limit for token verifications** : les vérifications passent par le serveur du site, donc Supabase voit les
  adresses de Vercel pour tous les utilisateurs. Augmenter la valeur (par exemple 150 par 5 minutes) si des
  inscriptions groupées (séance de formation) affichent « Trop de vérifications en même temps ». Le site limite déjà
  les codes erronés par compte.

### 2.5 Adresses de retour

*Authentication › URL Configuration* : inchangé (Site URL et `…/auth/callback**`, voir `docs/DEPLOIEMENT.md`).

## 3. Tester en production

1. Créer un compte sur le site avec une **vraie** adresse e-mail.
2. Vérifier l'arrivée de l'e-mail : expéditeur, sujet, code lisible, pas en spam. Dans Resend, *Emails* montre
   l'état de chaque envoi (*Delivered*, *Bounced*…).
3. Saisir un code faux : le message « Code incorrect ou expiré » s'affiche.
4. Saisir le bon code : on arrive dans l'espace.
5. Avec un autre compte, cliquer « Renvoyer un code » après 60 secondes. Seul le dernier e-mail fonctionne.
6. Se déconnecter, puis sur `/connexion` saisir l'adresse et cliquer « Recevoir un lien de connexion » : l'e-mail
   « Votre lien de connexion » arrive ; le bouton « Me connecter » mène à « Continuer », qui ouvre la session.
7. Recliquer sur le même lien : « Ce lien n'est plus valable » s'affiche.
8. Se connecter avec un compte créé par mot de passe mais non vérifié : le lien « Saisir mon code de vérification » apparaît.
9. En cas d'échec, consulter *Logs › Auth* dans Supabase : les erreurs SMTP y apparaissent.

## 4. Problèmes fréquents

| Symptôme | Cause probable | Solution |
|---|---|---|
| « L'inscription n'a pas pu aboutir » ; *Error sending confirmation email* dans les journaux Supabase | SMTP mal renseigné | Domaine *Verified* dans Resend, identifiant `resend`, clé avec permission d'envoi, adresse d'expédition sur le domaine vérifié, port 465 |
| E-mail jamais reçu | Rebond ou spam | État de l'envoi dans Resend › *Emails* ; ajouter DMARC ; vérifier le dossier spam |
| « Un e-mail vient déjà d'être envoyé. Patientez une minute » | Intervalle minimal de Supabase entre deux e-mails | Attendre la fin du compte à rebours |
| Le lien de l'e-mail mène à une adresse `localhost` ou à l'ancien site | *Site URL* mal réglée dans Supabase | *URL Configuration › Site URL* = adresse de production |
| « Ce lien n'est plus valable » au premier clic | Lien déjà utilisé, remplacé par un e-mail plus récent, ou expiré | Utiliser le dernier e-mail reçu, ou le code |
| « Trop de demandes d'inscription » | *Rate limit for sending emails* atteint | Augmenter la limite (2.4) |
| « Code incorrect ou expiré » avec le bon code | Code remplacé par un renvoi, ou délai dépassé | Utiliser le dernier e-mail reçu ; vérifier *Email OTP Expiration* |
| Code à 8 chiffres reçu | *Email OTP Length* réglé à 8 | Accepté par le site ; remettre 6 pour coller aux textes |

## 5. Tests automatiques

La pile de test locale (`tests/e2e-stack/start.sh`) remplace Resend par une boîte aux lettres locale
(`tests/e2e-stack/mail-sink.mjs`). GoTrue, le serveur d'authentification de Supabase, y envoie de vrais e-mails
générés avec le modèle du dépôt. Aucun e-mail ne sort de la machine.

`tests/e2e/auth.spec.ts` vérifie :

- connexion par code (lien et code dans le même e-mail), retour vers la page demandée ;
- lien magique : la page seule ne consomme rien, le clic connecte, le lien ne sert qu'une fois ;
- adresse inconnue à la connexion : même écran, aucun e-mail, aucun compte créé ;
- inscription sans mot de passe (candidat, puis « Vos coordonnées » ; organisation partenaire) ;
- adresse déjà inscrite à l'inscription : même écran, un lien de connexion part au titulaire ;
- méthode « mot de passe » retenue par le navigateur ;
- inscription avec mot de passe, code faux puis bon code ;
- usage unique du code ;
- renvoi : le nouveau code remplace l'ancien ;
- code expiré ;
- suspension après des codes erronés répétés ;
- connexion avant vérification ;
- absence d'e-mail pour une adresse déjà inscrite.

Ces tests ne prouvent pas l'envoi par Resend. Cette partie se vérifie en production (section 3).
