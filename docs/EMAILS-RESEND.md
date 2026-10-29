# E-mails d'authentification : Resend + Supabase Auth

Les comptes créés par e-mail et mot de passe (candidats et partenaires) sont activés par un **code de
vérification** reçu par e-mail.

| Qui | Fait quoi |
|---|---|
| Site (Next.js) | Appelle `supabase.auth.signUp()`, affiche la page `/verification`, transmet le code saisi à `supabase.auth.verifyOtp({ type: "signup" })`, limite les codes erronés et les renvois |
| Supabase Auth | **Génère** le code, l'insère dans l'e-mail, le **vérifie** et ouvre la session |
| Resend | **Transporte** l'e-mail (serveur SMTP configuré dans Supabase), rien d'autre |

Aucune clé Resend n'est utilisée par le site : la clé se saisit **uniquement** dans le tableau de bord Supabase.

## Parcours

1. Le visiteur remplit le formulaire d'inscription (`/inscription`).
2. Le serveur appelle `supabase.auth.signUp()` ; Supabase crée le compte (non vérifié) et génère le code.
3. Supabase envoie l'e-mail par le SMTP de Resend, avec le modèle `supabase/templates/confirmation.html`.
4. Le visiteur arrive sur `/verification` (l'adresse est retenue dans un cookie httpOnly, jamais dans l'URL).
5. Il saisit le code ; le serveur appelle `supabase.auth.verifyOtp({ email, token, type: "signup" })`.
6. Code valide : session ouverte (cookies httpOnly), redirection vers son espace (`/candidat`, ou
   `/partenaire/en-attente` pour une organisation en attente de validation).

Le code de confirmation d'inscription (`type: "signup"`) n'est pas le code de connexion sans mot de passe
(`type: "email"`), que le site n'utilise pas : la connexion se fait avec l'e-mail et le mot de passe.

Garde-fous du site :

- **Codes erronés** : 5 par compte depuis une même adresse IP, 10 par compte toutes adresses confondues et 30 par
  adresse IP, en 15 minutes. Ces limites s'ajoutent à celles de Supabase.
- **Renvoi de code** : il est possible après le délai minimal de Supabase entre deux e-mails (60 s par défaut). Le site
  accepte aussi 3 demandes par adresse e-mail et 10 par adresse IP en 15 minutes.
- **Pas d'énumération des comptes** : une adresse déjà inscrite mène à la même page, sans e-mail envoyé.
- **Connexion avant vérification** : un lien mène à la saisie du code.

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

### 2.3 Modèle de l'e-mail

*Authentication › Emails › Templates › Confirm signup* :

- **Subject** : `Votre code de vérification YEN Career Bridge`
- **Message body** : coller le contenu de `supabase/templates/confirmation.html`. Supabase y remplace `{{ .Token }}`
  par le code.

Le modèle ne contient volontairement **pas de lien** de confirmation. Certaines messageries (Outlook, antivirus
d'entreprise) ouvrent les liens pour les analyser, ce qui consommerait le code avant l'utilisateur. Le modèle
*Reset password* garde son lien (voir `docs/DEPLOIEMENT.md`).

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
5. Avec un autre compte, cliquer « Renvoyer un code » après 60 secondes. Seul le dernier code fonctionne.
6. Se connecter avec un compte non vérifié : le lien « Saisir mon code de vérification » apparaît.
7. En cas d'échec, consulter *Logs › Auth* dans Supabase : les erreurs SMTP y apparaissent.

## 4. Problèmes fréquents

| Symptôme | Cause probable | Solution |
|---|---|---|
| « L'inscription n'a pas pu aboutir » ; *Error sending confirmation email* dans les journaux Supabase | SMTP mal renseigné | Domaine *Verified* dans Resend, identifiant `resend`, clé avec permission d'envoi, adresse d'expédition sur le domaine vérifié, port 465 |
| E-mail jamais reçu | Rebond ou spam | État de l'envoi dans Resend › *Emails* ; ajouter DMARC ; vérifier le dossier spam |
| « Un code vient déjà d'être envoyé. Patientez une minute » | Intervalle minimal de Supabase entre deux e-mails | Attendre la fin du compte à rebours |
| « Trop de demandes d'inscription » | *Rate limit for sending emails* atteint | Augmenter la limite (2.4) |
| « Code incorrect ou expiré » avec le bon code | Code remplacé par un renvoi, ou délai dépassé | Utiliser le dernier e-mail reçu ; vérifier *Email OTP Expiration* |
| Code à 8 chiffres reçu | *Email OTP Length* réglé à 8 | Accepté par le site ; remettre 6 pour coller aux textes |

## 5. Tests automatiques

La pile de test locale (`tests/e2e-stack/start.sh`) remplace Resend par une boîte aux lettres locale
(`tests/e2e-stack/mail-sink.mjs`). GoTrue, le serveur d'authentification de Supabase, y envoie de vrais e-mails
générés avec le modèle du dépôt. Aucun e-mail ne sort de la machine.

`tests/e2e/auth.spec.ts` vérifie :

- inscription, code faux puis bon code ;
- usage unique du code ;
- renvoi : le nouveau code remplace l'ancien ;
- code expiré ;
- suspension après des codes erronés répétés ;
- connexion avant vérification ;
- absence d'e-mail pour une adresse déjà inscrite.

Ces tests ne prouvent pas l'envoi par Resend. Cette partie se vérifie en production (section 3).
