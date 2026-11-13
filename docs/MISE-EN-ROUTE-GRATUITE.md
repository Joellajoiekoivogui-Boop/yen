# Mise en route gratuite : Google + e-mails par Gmail

Deux réglages, sans nom de domaine ni abonnement. Durée : environ 20 minutes. Rien à modifier dans le site.
Les valeurs ci-dessous sont celles du projet YEN : il suffit de les copier.

| Élément | Valeur |
|---|---|
| Adresse du site | `https://yen-b3vs.vercel.app` |
| Projet Supabase | `https://aohiuhwtoqhxzbvzvbdz.supabase.co` |
| Adresse de retour Google | `https://aohiuhwtoqhxzbvzvbdz.supabase.co/auth/v1/callback` |

Les mots de passe et secrets se saisissent uniquement dans Google et Supabase. Ne les envoyez à personne et
ne les mettez pas dans le code.

## Partie 1 : connexion avec Google

### Dans Google Cloud (<https://console.cloud.google.com>)

1. Connectez-vous avec le compte Google de YEN. En haut, **Sélectionner un projet › Nouveau projet**, nom
   `YEN Career Bridge`, **Créer**.
2. Menu **API et services › Écran de consentement OAuth** (ou « Google Auth Platform ») : **Premiers pas**.
   - Nom de l'application : `YEN Career Bridge`
   - Adresse d'assistance : votre adresse e-mail
   - Type d'audience : **Externe**
   - Coordonnées : votre adresse e-mail, puis accepter et **Créer**.
3. Menu **Clients › Créer un client** :
   - Type : **Application Web**
   - Nom : `YEN Career Bridge`
   - Origines JavaScript autorisées : `https://yen-b3vs.vercel.app`
   - URI de redirection autorisés : `https://aohiuhwtoqhxzbvzvbdz.supabase.co/auth/v1/callback`
   - **Créer**. Google affiche un **ID client** et un **code secret** : gardez la fenêtre ouverte.
4. Menu **Audience** : cliquez sur **Publier l'application**. Sans cela, seuls les comptes de test peuvent se
   connecter.

### Dans Supabase (<https://supabase.com/dashboard>, projet YEN)

5. **Authentication › Sign In / Providers › Google** : activez, collez l'ID client et le code secret,
   **Save**.
6. **Authentication › URL Configuration** :
   - Site URL : `https://yen-b3vs.vercel.app`
   - Redirect URLs : ajoutez `https://yen-b3vs.vercel.app/auth/callback**`

### Vérifier

7. Ouvrez `https://yen-b3vs.vercel.app/connexion` : le bouton « Continuer avec Google » apparaît. Connectez-vous
   avec un compte Gmail : vous arrivez sur « Vos coordonnées ».

## Partie 2 : e-mails (lien et code) par Gmail

### Dans Google

1. Créez une adresse Gmail réservée au site, par exemple `yencareerbridge@gmail.com` (<https://accounts.google.com/signup>).
2. Sur ce compte : <https://myaccount.google.com/security>, activez la **validation en deux étapes**.
3. Ouvrez <https://myaccount.google.com/apppasswords>, nom `Supabase`, **Créer**. Google affiche un mot de passe
   de 16 lettres : copiez-le (il ne s'affiche qu'une fois).

### Dans Supabase

4. **Authentication › Emails › SMTP Settings** : activez **Enable Custom SMTP**.

   | Champ | Valeur |
   |---|---|
   | Sender email | l'adresse Gmail créée |
   | Sender name | `YEN Career Bridge` |
   | Host | `smtp.gmail.com` |
   | Port | `465` |
   | Username | l'adresse Gmail créée |
   | Password | le mot de passe de 16 lettres (sans espaces) |

   **Save**.
5. **Authentication › Emails › Templates** :
   - **Confirm signup** : sujet `Votre code de vérification YEN Career Bridge` ; contenu : copiez tout le fichier
     `supabase/templates/confirmation.html`.
   - **Magic Link** : sujet `Votre lien de connexion YEN Career Bridge` ; contenu : copiez tout le fichier
     `supabase/templates/magic-link.html`.
6. **Authentication › Sign In / Providers › Email** : **Confirm email** activé, **Email OTP Length** = `6`.
7. **Authentication › Rate Limits** : « Rate limit for sending emails » = `100` par heure.

### Vérifier

8. Sur `https://yen-b3vs.vercel.app/inscription`, saisissez une vraie adresse e-mail. Un message « Votre code
   de vérification YEN Career Bridge » arrive en une à deux minutes (regardez aussi dans les spams), avec un
   bouton et un code à 6 chiffres. Le bouton mène à « Continuer », qui ouvre la session.

## Limites de cette solution gratuite

- Gmail limite l'envoi à environ 500 e-mails par jour.
- Les messages partent d'une adresse `@gmail.com` et peuvent parfois arriver dans les spams.
- Pour un volume plus grand ou une adresse au nom de YEN : un nom de domaine et Resend (`docs/EMAILS-RESEND.md`).
  Seuls les réglages de l'étape 4 changent ; le site reste identique.

## En cas de problème

| Symptôme | Cause probable | Solution |
|---|---|---|
| Pas de bouton Google sur le site | Google non activé dans Supabase | Partie 1, étape 5 |
| Google affiche « redirect_uri_mismatch » | Adresse de retour mal saisie | Partie 1, étape 3 : recopier l'adresse exacte |
| Google affiche « accès bloqué » ou « application non validée » | Application non publiée | Partie 1, étape 4 |
| Après Google, retour sur une page d'erreur du site | Redirect URLs incomplètes | Partie 1, étape 6 |
| Aucun e-mail reçu | Mot de passe d'application faux, ou validation en deux étapes inactive | Partie 2, étapes 2 à 4 ; voir Supabase › *Logs › Auth* |
| Le lien de l'e-mail mène à `localhost` | Site URL mal réglée | Partie 1, étape 6 |
