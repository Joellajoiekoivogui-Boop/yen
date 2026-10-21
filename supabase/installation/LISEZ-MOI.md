# Installation de la base sur Supabase (sans terminal)

Dans Supabase → **SQL Editor** → *New query*, coller puis **Run**, dans cet ordre :

1. `1-structure.sql` — tables, sécurité (RLS), stockage privé des CV
2. `2-catalogue.sql` — 15 domaines, 104 compétences, 47 métiers, 16 évaluations
3. `3-administrateur.sql` — après t'être inscrit sur le site : remplacer l'e-mail puis exécuter
4. `4-MISE-A-JOUR.sql` — **à exécuter aussi sur une base déjà installée** :
   - certificats en PDF **ou en image** (JPEG, PNG, WebP) ;
   - téléphone obligatoire pour les candidats ;
   - **toutes les fonctionnalités sans clé secrète** (évaluations, CV, notifications, vue partenaire…) ;
   - durcissement de sécurité issu de l'audit (comptes désactivés, liens, offres publiées…) ;
   - surface d'exposition minimale (aucune fonction ni donnée accessible sans connexion hors catalogue) ;
   - certificats simplifiés : formation suivie, organisme, période de la formation et justificatif.

   Ce fichier peut être exécuté plusieurs fois sans risque, même si une version précédente a déjà été
   exécutée : **ré-exécutez-le après chaque mise à jour du site**. Tant qu'il manque, un bandeau rouge
   « Base de données à mettre à jour » s'affiche dans la vue générale de l'administration.

Ces fichiers sont générés à partir de `supabase/migrations/` et `supabase/seed.sql`.
