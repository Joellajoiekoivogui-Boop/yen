# Architecture et modules

```
src/
  app/                    Routes (App Router)
    (public)/             Accueil, présentation, fonctionnement, domaines, partenaires, légal
    (auth)/               Connexion, inscription, mot de passe, accès refusé, compte désactivé
    auth/                 Callback des liens e-mail, déconnexion (POST)
    candidat/             Espace candidat (13 rubriques)
    admin/                Espace YEN (vue générale, talents, corrections, évaluations, catalogue,
                          offres, candidatures, partenaires, placements, rapports, utilisateurs, audit, paramètres)
    partenaire/           Espace partenaire (offres, candidatures, profils partagés, organisation)
    api/                  Téléchargements signés, exports CSV/PDF, export des données du candidat
  components/             UI réutilisable (ui/, forms/, layout/, charts/, vues métier partagées)
  features/               Logique métier par domaine fonctionnel (voir ci-dessous)
  lib/                    Supabase (clients, proxy), session et permissions, actions, libellés, utilitaires
  proxy.ts                Rafraîchissement de session et redirection des espaces protégés
supabase/                 Migrations, seed généré, données du catalogue
scripts/                  Génération du seed, création d'administrateur, données de démo
tests/                    unit/ (Vitest), db/ (RLS sur PostgreSQL), e2e/ (Playwright), e2e-stack/ (pile locale)
```

Règles transverses : chaque action serveur passe par `runAction` (session, compte actif, permission, erreurs sans fuite
d'information) et revalide ses entrées avec le même schéma Zod que le formulaire client. Les autorisations sont
vérifiées côté serveur **et** par RLS ; un bouton masqué n'est jamais une protection.

## Modules (`src/features`)

| Module | Rôle |
|---|---|
| `auth` | Inscription candidat/partenaire, connexion (limitation IP + e-mail), réinitialisation, déconnexion globale |
| `candidates` | Profil, parcours, projets, certifications, compétences déclarées, consentements ; complétion (≠ compétence) ; agrégation des compétences démontrées ; transitions automatiques limitées du pipeline |
| `cv` | Contrôle des PDF (`pdf-validation.ts`), antivirus optionnel, stockage privé versionné, extraction de texte, CV PDF généré depuis le profil |
| `assessments` | Correction automatique (`grading.ts`), tentatives chronométrées côté serveur, correction humaine, preuves par évaluateur, vérification de projets, banque de questions versionnée |
| `matching` | Moteur de compatibilité 0-100 explicable (`engine.ts`), pondération offre > métier > plateforme, chargement des preuves en lot |
| `ai` | Fournisseur abstrait, prompts versionnés, schémas, traçabilité des conclusions (`traceability.ts`), normalisation des compétences, services et actions |
| `offers` | Offres YEN et partenaires (validation), compétences obligatoires/souhaitées, informations employeur restreintes |
| `applications` | Candidatures, présélection, proposition au partenaire, entretiens, retours partenaires, partages de profils |
| `partners` | Vue restreinte d'un candidat pour un partenaire (après contrôle SQL `partner_can_view_candidate`) |
| `admin` | Répertoire des talents (filtres, tri, pagination), classement intelligent, suivi, placements, utilisateurs/rôles, paramètres, catalogue, organisations |
| `reporting` | Exports CSV (anti-injection de formules) et PDF du rapport d'insertion |
| `notifications` | Notifications internes, file d'envoi externe (désactivée), notification du personnel par permission |
| `catalog` | Lecture du catalogue (base, ou catalogue de référence si Supabase n'est pas configuré) |

## Moteur de compatibilité

Composantes et pondération par défaut (modifiable dans *Paramètres*, par métier et par offre) : compétences démontrées 40,
résultats d'évaluation 25, projets 15, formation et certifications 10, expérience 10.
- Une composante sans données est **exclue** et listée dans « données manquantes » ; le score affiché porte sur les données
  disponibles, le « score plancher » indique le résultat si les données manquantes valaient zéro, et la confiance baisse.
- Exigences obligatoires non démontrées signalées sans exclusion automatique.
- Classement : score, puis respect des exigences obligatoires, puis confiance.

## Évaluations

Choix unique (tout ou rien), choix multiple (proportionnel, une erreur annule), réponse courte (comparaison normalisée),
réponses libres/études de cas/exercices (correction humaine, aide IA facultative). Niveau attribué = niveau de
l'évaluation si le seuil est atteint, plafonné (avancé par défaut) ; expert uniquement après validation humaine
(contrainte SQL en plus). Les questions et clés ne sont jamais lisibles par les candidats (RLS) : elles sont distribuées
sans clés par le serveur.

## Pipeline d'insertion

Statuts du cahier des charges (`pipeline_status`). Seules les transitions « profil incomplet ↔ en cours d'évaluation »
sont automatiques ; les autres sont des décisions humaines ou découlent des étapes de candidature. Les placements
distinguent « déclaré » et « confirmé ».
