# Installation de la base sur Supabase (sans terminal)

Dans Supabase → **SQL Editor** → *New query*, coller puis **Run**, dans cet ordre :

1. `1-structure.sql` — tables, sécurité (RLS), stockage privé des CV
2. `2-catalogue.sql` — 15 domaines, 104 compétences, 47 métiers, 16 évaluations
3. `3-administrateur.sql` — après t'être inscrit sur le site : remplacer l'e-mail puis exécuter
4. `4-MISE-A-JOUR.sql` — **à exécuter aussi sur une base déjà installée** :
   - certificats en PDF **ou en image** (JPEG, PNG, WebP) ;
   - téléphone obligatoire pour les candidats ;
   - **toutes les fonctionnalités sans clé secrète** (évaluations, CV, notifications, vue partenaire…).

   Ce fichier peut être exécuté plusieurs fois sans risque. Il remplace les anciens fichiers 4 et 5.

Ces fichiers sont générés à partir de `supabase/migrations/` et `supabase/seed.sql`.
