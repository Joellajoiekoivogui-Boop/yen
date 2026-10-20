# Sécurité et confidentialité

## Rôles et permissions

Rôles : `super_admin`, `insertion_manager`, `evaluator`, `partner_manager`, `candidate`, `partner`.
Permissions (table `permissions`, matrice `role_permissions`, migration 1) : `users.manage`, `roles.manage`,
`candidates.read`, `candidates.manage`, `documents.read`, `notes.manage`, `assessments.manage`, `assessments.review`,
`catalog.manage`, `partners.manage`, `offers.manage`, `applications.manage`, `shares.manage`, `placements.manage`,
`ai.run`, `ai.review`, `reports.view`, `reports.export`, `audit.read`, `settings.manage`.

- Les rôles sont dans `user_roles`, jamais dans le profil : un utilisateur ne peut pas changer son rôle.
- Seul `super_admin` (permission `roles.manage`) attribue des rôles ; seul un `super_admin` attribue `super_admin`
  et ne peut retirer son propre rôle (trigger `guard_user_roles`).
- L'inscription n'attribue que `candidate` ; les métadonnées envoyées ne peuvent pas élever les droits (testé).
- Un compte désactivé perd immédiatement toutes ses permissions (fonctions `has_permission`) et ses sessions sont révoquées.

## Row Level Security

RLS est activée sur **toutes** les tables du schéma `public` (migration 6). Points clés :
- Candidat : uniquement ses propres lignes ; aucun accès aux questions/clés d'évaluation, ni écriture de résultats.
- Champs de suivi YEN, vérifications de projets/certifications, statut de recommandation, état des notifications :
  protégés par triggers contre la modification par l'intéressé.
- Partenaire : aucun accès direct aux tables candidats. L'accès passe par `partner_can_view_candidate()` (candidature
  transmise à son organisation, ou partage actif **et** consentement en cours). La vue partenaire exclut e-mail,
  téléphone, notes internes, analyses IA et suivi YEN.
- Partage et proposition au partenaire impossibles sans consentement `partage_partenaires` (contrôle en base). Le retrait
  du consentement coupe l'accès immédiatement.
- Notes internes : personnel avec `notes.manage` uniquement.
- Journal d'audit : lecture `audit.read`, ajout seul (mise à jour et suppression interdites par trigger).

## Fonctions SQL de confiance (sans clé de service)

Les opérations qu'un utilisateur ne doit pas pouvoir faire directement passent par des fonctions SQL
`SECURITY DEFINER` (migration 11) qui vérifient elles-mêmes l'appelant (`auth.uid()`, permissions) :
- **Évaluations** : `start_assessment_attempt`, `get_attempt_questions` (jamais de bonne réponse ni d'explication),
  `submit_assessment_attempt` (correction en base, mêmes règles que `grading.ts`), `finalize_assessment_review`
  (évaluateur), `get_attempt_review`. Les clés de correction ne quittent jamais la base.
- **Documents** : `register_cv_document` (dossier `<user_id>/` imposé), `retire_candidate_document`, `set_current_cv`.
- **Notifications** : qui peut prévenir qui est contrôlé en base (personnel, candidat concerné, organisation qui suit
  la candidature) ; liens internes uniquement.
- **Pipeline** : seules les étapes automatiques sont réglables par le candidat ; le reste suit les candidatures.
- **Partenaires** : `partner_candidate_data` ne renvoie que des champs professionnels, après `partner_can_view_candidate()`.
- **Limitation de débit** : `rate_limit_hit`, plafonds fixés en base ; les clés liées à un utilisateur doivent être les siennes.
- **Journal** : `log_audit` écrit au nom de l'utilisateur connecté ; les triggers d'audit conservent l'auteur réel
  même dans les sections exécutées « comme le service » (`_as_service`, non appelable par les clients).

La clé de service n'est donc plus nécessaire en production (elle reste utilisée par les fonctions d'IA et la
déconnexion immédiate d'un compte désactivé).

Ces règles sont couvertes par 64 tests exécutés sur un vrai PostgreSQL (`tests/db/rls.test.ts`,
`tests/db/server-functions.test.ts`).

## Documents

Bucket privé `candidate-documents`, chemin `<user_id>/<uuid>.pdf` imposé par politique de stockage, aucune mise à jour
en place (nouvelle version à chaque dépôt), téléchargement via URL signée de 60 s après contrôle d'accès, accès du
personnel et des partenaires journalisés. Contrôle du type réel, de la taille, du contenu actif ; antivirus optionnel.

## Application

- Autorisation revérifiée dans chaque page (`requireCandidate/requireStaff/requirePartner`) et chaque action (`runAction`).
- Validation Zod côté client et serveur ; requêtes paramétrées (supabase-js/PostgREST) ; rendu React échappé.
- Clé de service utilisée uniquement côté serveur (`import "server-only"`), dans des fonctions étroites, après contrôle.
- Limitation de débit partagée en base (connexion, inscription, réinitialisation, téléversements, IA).
- En-têtes : CSP stricte (aucune ressource tierce hors Supabase), `frame-ancestors 'none'`, `nosniff`, HSTS, `Referrer-Policy`.
- Redirections internes uniquement (protection contre les redirections ouvertes), déconnexion en POST avec contrôle d'origine.
- Messages d'erreur génériques ; détails techniques uniquement dans les journaux serveur.
- Exports soumis à `reports.export` et journalisés ; CSV protégé contre l'injection de formules.

## Sauvegardes et restauration

- Supabase Pro : sauvegardes quotidiennes automatiques ; activer le **Point-in-Time Recovery** pour la production.
- En complément, export logique hebdomadaire chiffré et stocké hors Supabase :
  `pg_dump --format=custom --no-owner "$DATABASE_URL" > yen-$(date +%F).dump`
  et sauvegarde du bucket `candidate-documents` (API Storage ou `supabase storage cp`).
- Restauration : `pg_restore --clean --no-owner -d "$DATABASE_URL" yen-AAAA-MM-JJ.dump`, puis restauration des fichiers.
  Tester la restauration au moins une fois par trimestre sur un projet de préproduction.

## Suppression et rectification des données

- Rectification : par le candidat dans son profil, ou par YEN.
- Export : *Paramètres et confidentialité → Exporter mon profil* (JSON complet).
- Suppression : le candidat dépose une demande (journalisée, visible dans *Utilisateurs et rôles*). Procédure :
  1. vérifier l'identité et les obligations de conservation (placements à des fins statistiques) ;
  2. supprimer le compte dans Supabase Auth (*Authentication → Users → Delete*) : la cascade supprime profil, parcours,
     documents (métadonnées), consentements, candidatures ;
  3. supprimer les fichiers restants du dossier `<user_id>/` du bucket ;
  4. consigner la suppression (le journal d'audit conserve l'identifiant technique, sans contenu personnel).

## Production — à ne pas oublier

- Aucun compte ni mot de passe par défaut ; créer les comptes du personnel avec `scripts/create-admin.ts`.
- Activer la confirmation des e-mails et un SMTP ; renseigner les URL de redirection exactes.
- Ne jamais exposer `SUPABASE_SECRET_KEY` ni `ANTHROPIC_API_KEY` (pas de préfixe `NEXT_PUBLIC_`).
- Faire valider la politique de confidentialité et les conditions d'utilisation (modèles fournis) par YEN.
