-- =============================================================================
-- Migration 8 : informations minimales des organisations visibles des candidats
-- Un candidat doit connaître l'employeur d'une offre publiée, d'une offre à
-- laquelle il a postulé, ou d'une organisation avec laquelle son profil a été
-- partagé — sans accéder aux coordonnées internes (contacts, téléphones,
-- statut). La vue s'exécute avec les droits de son propriétaire et n'expose que
-- des colonnes descriptives.
-- =============================================================================
create or replace view public.offer_organizations as
  select o.id, o.name, o.sector, o.city, o.country, o.description, o.website
  from public.organizations o
  where (o.status = 'actif' and exists (select 1 from public.job_offers j where j.organization_id = o.id and j.status = 'publiee'))
     or exists (select 1 from public.applications a join public.job_offers j on j.id = a.offer_id
                where j.organization_id = o.id and a.candidate_id = public.auth_candidate_id())
     or exists (select 1 from public.profile_shares s where s.organization_id = o.id and s.candidate_id = public.auth_candidate_id());

revoke all on public.offer_organizations from anon;
grant select on public.offer_organizations to authenticated;
