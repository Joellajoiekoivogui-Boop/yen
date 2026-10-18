-- =============================================================================
-- Attribution manuelle d'un rôle du personnel (alternative SQL à create-admin.ts)
-- À exécuter dans l'éditeur SQL Supabase (rôle postgres), APRÈS que la personne
-- a créé son compte et confirmé son adresse e-mail.
-- =============================================================================
-- Remplacer l'adresse et le rôle ci-dessous :
--   super_admin | insertion_manager | evaluator | partner_manager
do $$
declare
  v_email text := 'prenom.nom@exemple.org';
  v_role public.app_role := 'super_admin';
  v_id uuid;
begin
  select id into v_id from auth.users where lower(email) = lower(v_email);
  if v_id is null then raise exception 'Aucun compte pour %', v_email; end if;
  update public.profiles set account_type = 'staff' where id = v_id;
  insert into public.user_roles (user_id, role) values (v_id, v_role) on conflict do nothing;
  raise notice 'Rôle % attribué à %', v_role, v_email;
end $$;
