# Installation de la base sur Supabase (sans terminal)

Dans Supabase → **SQL Editor** → *New query*, coller puis **Run**, dans cet ordre :

1. `1-structure.sql` — tables, sécurité (RLS), stockage privé des CV
2. `2-catalogue.sql` — 15 domaines, 104 compétences, 47 métiers, 16 évaluations
3. `3-administrateur.sql` — après t'être inscrit sur le site : remplacer l'e-mail puis exécuter

Ces fichiers sont générés à partir de `supabase/migrations/` et `supabase/seed.sql`.
