# Points de retour

Avant un changement important, un **point de retour** est enregistré sur GitHub. Il permet de revenir à l'état
d'avant sans rien casser. Pour l'utiliser, il suffit de dire : « reviens en arrière à `<nom>` ».

| Nom | Date | État enregistré |
|---|---|---|
| `avant-equipe-ux` | 5 novembre 2026 | Site en ligne avant le travail de l'équipe UX : tableau de bord, entretiens, résultats et correction tels qu'avant (commit `72bf7a6`) |
| `avant-ux-vitrine` | 5 novembre 2026 | Site vitrine avant le travail de l'équipe UX (accueil, fonctionnement), espaces candidat et évaluateur déjà améliorés (commit `5583d4b`) |
| `avant-corrections-audit` | 11 novembre 2026 | Site avant les corrections de l'audit complet : accessibilité des tableaux, protection Google, robustesse de l'IA, mises à jour de sécurité (commit `163591a`) |

Le point de retour est une **branche GitHub** du même nom. Le proxy de cette session refuse les étiquettes
(tags) ; la branche joue le même rôle et reste sur GitHub.

## Comment le retour se fait

1. **Voir ce qui sera annulé** : liste des changements faits depuis le point de retour
   (par exemple `git log --oneline avant-ux-vitrine..main`), à confirmer avant d'agir.
2. **Annuler sans effacer** : `git revert --no-edit <nom>..main` crée de nouveaux changements qui
   remettent le code dans l'état du point de retour. L'historique est conservé : on peut revenir de nouveau en
   avant si besoin.
3. **Tests**, puis envoi sur `main` : Vercel remet en ligne la version d'avant.

Pas de `git reset --hard` ni d'écrasement forcé de `main` : rien n'est supprimé.

## En urgence : retour immédiat dans Vercel

Dans Vercel, projet *yen-b3vs* : **Deployments**. Sur le déploiement du commit du point de retour
(`72bf7a6` pour `avant-equipe-ux`, `5583d4b` pour `avant-ux-vitrine`, `163591a` pour `avant-corrections-audit`), menu « … » puis **Instant Rollback**.
Le site d'avant est remis en ligne en quelques secondes, sans toucher au code. Faire ensuite le retour dans le code (ci-dessus) pour que le prochain
déploiement ne réinstalle pas la version annulée.

## Base de données

Les changements de l'équipe UX (espaces et site vitrine) ne modifient pas la base de données (aucune
migration) : le retour en arrière n'efface aucune donnée. Les comptes, entretiens passés, corrections et candidatures restent intacts.
