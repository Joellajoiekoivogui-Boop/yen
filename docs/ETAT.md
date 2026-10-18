# État du projet

Date : 18 octobre 2026.

## Fonctionnalités terminées et vérifiées

Vérifié par les tests automatisés (unitaires, RLS sur PostgreSQL, parcours de bout en bout sur une pile GoTrue +
PostgREST locale) et par un balayage de toutes les pages des trois espaces sans erreur serveur.

- **Pages publiques** : accueil, présentation, fonctionnement, 15 domaines avec fiches complètes, partenaires (publication autorisée uniquement), confidentialité, conditions.
- **Identité** : inscription candidat (tous les champs demandés) et demande partenaire, identifiant `YEN-CB-000001` généré par la base, connexion avec limitation par IP et par e-mail, réinitialisation du mot de passe, déconnexion globale, désactivation/réactivation des comptes, historique (audit).
- **Rôles et permissions** : 6 rôles, 20 permissions, RLS sur toutes les tables, protections par triggers, aucun compte par défaut.
- **Espace candidat** : tableau de bord (complétion distincte des compétences, compétences évaluées/à évaluer, recommandations, offres compatibles, candidatures, évolution), profil, formations, expériences, langues, projets, certifications, compétences déclarées vs démontrées avec preuves, évaluations chronométrées, résultats détaillés, métiers recommandés explicables, offres filtrables, candidature, suivi avec historique, plan de progression, notifications, consentements, export JSON, demande de suppression, changement de mot de passe.
- **CV** : contrôle du type réel et de la taille, rejet du contenu actif, stockage privé versionné, restauration/suppression d'une version, URL signées de 60 s, extraction du texte, détection des PDF scannés, CV PDF généré depuis le profil (sans invention).
- **Évaluations** : 16 évaluations publiées (67 questions) couvrant les 15 domaines, correction automatique, correction humaine avec grille, plafonnement du niveau, preuves par évaluateur, vérification des projets, retours partenaires soumis à validation, banque de questions administrable et versionnée.
- **Compatibilité** : score 0-100 explicable, pondération configurable (plateforme, métier, offre), données manquantes signalées, score plancher, confiance, exigences obligatoires, aucune caractéristique sensible.
- **Espace YEN** : vue générale (démo exclue par défaut), répertoire des talents (11 filtres, tri, pagination, export CSV), fiche candidat en 12 onglets avec toutes les actions demandées, classement intelligent par offre, présélection, proposition au partenaire, décisions motivées, entretiens, partages avec consentement, corrections, catalogue, partenaires et recruteurs, placements (déclaré/confirmé), rapports mensuels/trimestriels/annuels avec dénominateur explicite (CSV, PDF), utilisateurs et rôles, audit, paramètres.
- **Espace partenaire** : activation par YEN, organisation, offres soumises à validation, candidatures reçues, présélection, étapes du recrutement, entretiens, retours sur les compétences, profils partagés (accès temporaire), téléchargement du CV autorisé uniquement.
- **Notifications internes** : questionnaires, résultats, recommandations, offres pertinentes, candidatures, entretiens, décisions, demandes d'informations.
- **Données de démonstration** fictives, identifiées et supprimables.

## Implémenté mais non exécuté contre un service réel

| Élément | Situation |
|---|---|
| Services IA (extraction de CV/OCR, analyse de profil, amélioration de CV, plan, synthèse, aide à la correction, assistant) | Code complet, typé contre le SDK, traçabilité testée unitairement, mais **jamais appelé avec une vraie clé API** dans cet environnement. À valider dès la configuration de `ANTHROPIC_API_KEY`. |
| Stockage Supabase | Testé via une passerelle qui émule l'API Storage et applique les vraies politiques RLS ; à revérifier sur un projet Supabase réel. |
| E-mails d'authentification | Les tests utilisent la confirmation automatique ; le parcours avec e-mail réel (lien `/auth/callback`) dépend du SMTP configuré dans Supabase. |
| Antivirus ClamAV | Client implémenté ; aucun service ClamAV disponible pour le tester. |

## Intégrations nécessitant une configuration manuelle

1. Projet Supabase (URL, clés), migrations, catalogue, SMTP, URL de redirection — obligatoire.
2. `ANTHROPIC_API_KEY` + `AI_PROVIDER=anthropic` — pour toutes les fonctions IA.
3. `CLAMAV_SCAN_URL` — antivirus des CV (recommandé).
4. Fournisseurs e-mail / SMS / WhatsApp — architecture prête (`ExternalChannel`), aucun fournisseur branché.
5. Logo officiel de YEN — la marque affichée est un placeholder textuel (`src/components/layout/logo.tsx`).
6. Validation juridique de la politique de confidentialité et des CGU (modèles fournis), durées de conservation.

## Limites connues

- Le classement intelligent est calculé à la demande (jusqu'à 400 candidats pré-filtrés par offre) ; au-delà de quelques milliers de candidats, envisager un pré-calcul.
- Les parcours « correction humaine », « retour partenaire » et « enregistrement d'un placement » sont couverts par les tests RLS et le rendu des pages, pas encore par un test de bout en bout dédié.
- Les types de base de données ne sont pas générés (`npm run db:types` disponible) ; les requêtes utilisent des types locaux.
- Conversation de l'assistant IA non conservée (choix de confidentialité).
