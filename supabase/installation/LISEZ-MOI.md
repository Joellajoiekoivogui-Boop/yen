# Installation de la base sur Supabase (sans terminal)

Dans Supabase → **SQL Editor** → *New query*, coller puis **Run**, dans cet ordre :

1. `1-structure.sql` — tables, sécurité (RLS), stockage privé des CV
2. `2-catalogue.sql` — 15 domaines, 104 compétences, 47 métiers, 16 évaluations
3. `3-administrateur.sql` — après t'être inscrit sur le site : remplacer l'e-mail puis exécuter
4. `4-certificats-pdf-images.sql` — certificats en PDF **ou en image** (JPEG, PNG, WebP)
5. `5-telephone-obligatoire.sql` — un candidat ne peut plus effacer son numéro de téléphone

Les fichiers 4 et 5 sont des mises à jour : on peut les exécuter plusieurs fois sans risque.

Ces fichiers sont générés à partir de `supabase/migrations/` et `supabase/seed.sql`.
