# Recherche UX : apprenants, évaluateurs et site vitrine

Travail mené sous cinq angles : recherche utilisateur, psychologie cognitive, psychologie sociale, design
comportemental et design d'interface. Point de retour avant ces changements : `avant-equipe-ux`
(voir `docs/RETOUR-ARRIERE.md`).

## Méthode et limites

Revue experte des parcours, écran par écran et dans le code, à la lumière de résultats établis sur
l'apprentissage et la motivation. **Aucun entretien n'a encore été mené avec de vrais candidats ou évaluateurs** :
les besoins ci-dessous sont des hypothèses solides, à confirmer avec le plan de la dernière section.

## Qui utilise la plateforme

| Profil | Ce qu'il vient faire | Contraintes probables |
|---|---|---|
| **Apprenant** (étudiant, diplômé, stagiaire) | Prouver ce qu'il sait faire, trouver un stage ou un emploi | Téléphone, connexion qui coupe, données mobiles coûteuses ; enjeu fort (premier emploi), peur d'échouer |
| **Évaluateur / formateur YEN** | Corriger les études de cas, valider les preuves, conseiller | Temps limité, plusieurs copies à la suite, souci d'équité |

Besoins principaux de l'apprenant :

1. savoir **quoi faire maintenant** ;
2. ne **pas perdre** ses réponses ;
3. **comprendre** un résultat et savoir comment progresser ;
4. être **reconnu** pour ce qu'il a démontré.

Besoins de l'évaluateur : corriger **vite et juste**, et donner un retour utile sans y passer des heures.

## Constats par angle

### Psychologie cognitive (mémoire, apprentissage)

- **Attention partagée** : l'évaluateur lisait la réponse en haut de page et saisissait la note dans un formulaire
  en bas. Les allers-retours chargent la mémoire de travail et favorisent les erreurs de ligne.
- **Effet de test et retour correctif** : se tester fait apprendre, à condition de recevoir un retour clair sur ce
  qui manque. Le résultat mettait le score en avant, mais ne disait ni quoi revoir en priorité, ni quand réessayer.
- **Espacement** : réessayer après un ou deux jours de révision fait mieux retenir que recommencer aussitôt. Le
  délai entre deux tentatives existait, mais n'était ni expliqué ni daté.
- **Anxiété et mémoire de travail** : un chronomètre qui clignote en rouge consomme l'attention dont l'apprenant a
  besoin pour réfléchir.

### Psychologie sociale (motivation, interactions)

- **Autodétermination** (autonomie, compétence, appartenance) : on propose plutôt qu'on n'impose, on montre les
  progrès, et on rappelle qu'une équipe humaine corrige et accompagne.
- **« Pas encore » plutôt qu'« échec »** : « non réussie » et une croix orange font lire un premier essai comme un
  verdict. Présenter le résultat comme une étape, en montrant d'abord ce qui est acquis, entretient l'effort.
- **Comparaison sociale** : aucun classement entre apprenants. Il motive les premiers et décourage les autres.
- **Retour de l'évaluateur** : un commentaire utile cite un point réussi, puis une piste concrète, sur le travail
  et non sur la personne.
- **Biais d'ancrage** : afficher le seuil de réussite pendant la notation pousse à arrondir vers le seuil. Il
  n'apparaît donc pas sur l'écran de correction.

### Design comportemental

- **Une action, courte, au bon moment** : une action se fait quand la personne est motivée, qu'elle est facile et
  qu'un déclencheur la propose. Le tableau de bord offrait huit blocs au même niveau : trop de choix, aucune
  priorité.
- **Tâche commencée** : un entretien quitté en cours (le temps tourne) n'était rappelé nulle part.
- **Intention de mise en œuvre** : « nouvelle tentative possible le 6 novembre à 10 h » aide plus à revenir que
  « délai : 24 h ».
- **Écartés volontairement** : séries de jours consécutifs, badges à collectionner, notifications insistantes.
  Ils créent de la pression ou de la dépendance, sans rapport avec l'objectif (démontrer des compétences et être
  recruté).

## Ce qui a changé

| Écran | Avant | Après | Principe |
|---|---|---|---|
| Tableau de bord du candidat | 8 blocs au même niveau, un bouton « Passer un entretien » | Bloc **« Votre prochaine étape »** : une seule action, sa raison et sa durée ; un entretien commencé passe en premier | Une action claire, choix réduit, tâche commencée |
| Avant un entretien | Badges et un paragraphe d'avertissement | Encadré **« Avant de commencer »** : durée, réponses enregistrées, seuil, droit à l'erreur, travail personnel | Attentes claires, moins d'anxiété |
| Pendant l'entretien | Chronomètre clignotant en rouge | Chronomètre **sans clignotement**, **masquable** (il revient dans les 5 dernières minutes), annonces discrètes à 5 et 1 minute ; mention « réponses enregistrées sur cet appareil » | Charge cognitive, sentiment de sécurité |
| Résultat | Score, puis « non réussie » | **« Pas encore validé »**, ce qui est acquis puis ce qui est à renforcer, **date de la prochaine tentative**, conseil d'espacement, un bouton vers le plan de progression | Retour correctif, espacement, état d'esprit de progression |
| Correction (évaluateur) | Réponses en haut, notes dans un formulaire en bas | **Note et commentaire sous chaque réponse**, grille sous les yeux, **total en direct**, consignes pour un retour constructif, seuil masqué | Attention partagée, qualité du retour, équité |

Tests : logique de la prochaine étape (tests unitaires) et parcours complet de bout en bout (entretien
commencé puis repris depuis le tableau de bord, correction à côté de la réponse, résultat expliqué).

## Pistes suivantes

Ces pistes ne sont pas faites. Elles demandent une mise à jour de la base ou une validation préalable avec les utilisateurs.

1. **Corrigé complet** : montrer la réponse donnée et la bonne réponse à côté de chaque question (fonction SQL
   `get_attempt_review` à enrichir).
2. **Rappel espacé** : e-mail deux jours après un entretien non validé, avec les points à revoir.
3. **Vue formateur** : questions les plus souvent manquées par entretien, pour une remédiation collective.
4. **Entraide entre pairs** : petits groupes par domaine, sans classement.
5. **Délai de correction annoncé** au candidat, une fois mesuré sur des données réelles.

## Plan pour valider avec de vrais utilisateurs

- **Entretiens** (30 min) : 5 apprenants (dont 2 sur téléphone avec une connexion faible) et 3 évaluateurs.
  - Questions clés : « La dernière fois que vous avez ouvert la plateforme, qu'êtes-vous venu faire ? »,
    « Racontez votre dernier entretien raté : qu'avez-vous fait ensuite ? », « Comment corrigez-vous une étude de
    cas aujourd'hui ? ».
- **Test d'utilisabilité**, 5 tâches chronométrées :
  - trouver quoi faire ensuite ;
  - commencer puis reprendre un entretien ;
  - comprendre un résultat non validé ;
  - corriger une étude de cas ;
  - trouver quand réessayer.
- **Indicateurs à suivre** :
  - part des entretiens commencés puis soumis ;
  - part des candidats qui retentent après un « pas encore » ;
  - délai entre soumission et correction ;
  - clics sur « Votre prochaine étape » ;
  - complétion du profil.

---

# Site vitrine

Point de retour avant ces changements : `avant-ux-vitrine`. Même méthode et mêmes limites que ci-dessus : revue
experte, à valider avec de vrais visiteurs.

## Qui arrive sur le site, et avec quelle question

| Visiteur | Sa question en arrivant | Ce qui le fait partir |
|---|---|---|
| **Étudiant ou diplômé** (souvent sur téléphone, par un lien WhatsApp) | « C'est pour moi ? Qu'est-ce que j'y gagne ? Combien de temps ça prend ? » | Un discours institutionnel, la peur d'être « testé » et de rater, le doute sur ses données |
| **Recruteur ou organisation** | « Où est l'entrée pour moi ? Quels profils ? Quelles garanties ? » | Ne trouver que des appels destinés aux étudiants en haut de page |
| **Formateur, enseignant, équipe YEN** | « Comment mes apprenants en profitent-ils ? Qu'est-ce que je fais, moi ? » | Une carte « Équipe YEN » qui liste des fonctions internes plutôt que leur rôle |

## Constats par angle

- **Recherche utilisateur** : le titre principal (« Identifier les talents, renforcer les compétences… ») parlait
  du point de vue de l'organisation. En cinq secondes, un étudiant ne savait pas ce qu'il y gagnait. Les
  partenaires n'avaient pas d'entrée dans le premier écran.
- **Psychologie cognitive** : six étapes présentées à plat se retiennent mal ; regroupées en trois temps
  (se présenter, prouver, être recruté), elles se mémorisent d'un coup d'œil. Le texte d'accroche était long
  et abstrait (« preuves de compétences », « mises en relation »).
- **Psychologie sociale** :
  - **Identité et appartenance** : nommer le public (« jeunes ingénieurs et techniciens accompagnés par
    YEN ») aide chacun à se reconnaître.
  - **Peur de l'évaluation** : le mot « entretien » peut décourager de s'inscrire ; il faut dire qu'un échec se
    rattrape.
  - **Preuve sociale** : seules des photos réelles de la communauté sont montrées, jamais de faux témoignages
    ni de chiffres inventés.
- **Design comportemental** :
  - **Effort perçu** : annoncer l'effort réel (« moins d'une minute, sans mot de passe ») lève le principal
    frein à l'inscription.
  - **Une seule formulation** : le même appel « Créer mon profil » partout, au lieu de « Commencer » à certains
    endroits.
  - **Auto-orientation** : un lien direct pour les recruteurs dès le premier écran.
  - **Doutes levés au bon moment** : une foire aux questions repliée répond quand le doute se présente, sans
    alourdir la page.

## Ce qui a changé

| Endroit | Avant | Après | Principe |
|---|---|---|---|
| Accueil, premier écran | « Identifier les talents, renforcer les compétences, ouvrir l'accès au stage et à l'emploi. » | Public nommé en tête ; titre « Prouvez ce que vous savez faire, décrochez votre stage ou votre emploi. » ; accroche courte et concrète | Bénéfice pour le visiteur, identité |
| Sous les boutons | Rien | « Moins d'une minute, sans mot de passe. » et « Vous recrutez ? Espace partenaires » | Effort perçu, auto-orientation |
| « Pour qui ? » | Fonctions de l'outil ; carte « Équipe YEN » | Ce que chacun y gagne ; carte « Formateurs et équipe YEN » (correction avec grille, compétences prouvées, présélection, suivi) | Parler bénéfices, inclure les formateurs |
| « Comment ça marche » (accueil) | « Étape 2 sur 6 » | « Vous présenter · étape 2 sur 6 » et la durée quand elle est connue | Regroupement en trois temps |
| Questions fréquentes (nouveau) | Absent | 6 questions repliées : qui peut s'inscrire, à quoi servent les entretiens, et si j'échoue, qui voit mes données, le rôle du score, comment recruter | Lever les doutes au moment où ils se posent |
| Appel final | « Commencer » | « Créer mon profil », avec la même mention d'effort | Cohérence des appels |
| Page Fonctionnement | « Six étapes, dans l'ordre » | « Trois temps, six étapes » : temps indiqué sur chaque étape, durées réelles (inscription, entretiens), droit à l'erreur | Regroupement, effort perçu, droit à l'erreur |
| Image de partage (WhatsApp, réseaux) | Ancienne accroche | Nouvelle accroche | Cohérence du message |

Toutes les réponses viennent du fonctionnement réel de la plateforme. Ni tarif ni chiffre n'ont été inventés :
la gratuité, par exemple, n'est pas annoncée tant que YEN ne l'a pas confirmée.

## Pistes suivantes

1. **Gratuité et éligibilité** : si YEN confirme que la plateforme est gratuite pour les candidats, le dire
   dès le premier écran (frein majeur levé).
2. **Témoignages réels** : deux ou trois candidats placés, avec leur accord écrit, dans leurs propres mots.
3. **Page partenaires** : montrer un profil type (anonymisé) tel que le voit un recruteur.
4. **Page « Formateurs et établissements »** : comment orienter ses apprenants vers la plateforme.

## Plan pour valider

- **Test des 5 secondes** avec 10 étudiants : montrer le premier écran, puis demander « À qui s'adresse ce site ?
  Que pouvez-vous y faire ? ».
- **Test d'utilisabilité** avec 3 recruteurs : « Trouvez comment publier une offre ».
- **Indicateurs à suivre** :
  - part des visiteurs de l'accueil qui ouvrent l'inscription ;
  - questions fréquentes les plus ouvertes ;
  - clics sur « Vous recrutez ? ».

