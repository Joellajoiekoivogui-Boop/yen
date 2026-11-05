# Recherche UX : apprenants et évaluateurs

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
