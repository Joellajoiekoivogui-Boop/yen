-- =============================================================================
-- Migration 14 : certificats simplifiés et version du schéma
--  - un certificat = formation suivie, organisme, période de la formation, justificatif
--    (PDF ou image) ; les anciennes colonnes de dates restent pour l'historique ;
--  - app_schema_version() : l'application signale une base qui n'a pas reçu la mise à jour.
-- Rejouable sans erreur.
-- =============================================================================

alter table public.candidate_certifications add column if not exists training_period text;
do $$
begin
  alter table public.candidate_certifications
    add constraint candidate_certifications_training_period_len check (training_period is null or char_length(training_period) <= 100);
exception when duplicate_object then null;
end $$;

-- Un nouveau justificatif, ou une modification de la formation, de l'organisme ou de la
-- période, annule la vérification faite par YEN ; un justificatif doit appartenir au même candidat.
create or replace function public.protect_certification_verification()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.document_id is not null and not exists (
    select 1 from public.candidate_documents d where d.id = new.document_id and d.candidate_id = new.candidate_id
  ) then
    raise exception 'Justificatif invalide' using errcode = '42501';
  end if;
  if auth.uid() is null or public.has_permission('assessments.review') then return new; end if;
  if tg_op = 'INSERT' then
    new.verification_status := 'non_verifie';
  elsif new.verification_status is distinct from old.verification_status then
    raise exception 'La vérification d''une certification est réservée à YEN' using errcode = '42501';
  elsif new.document_id is distinct from old.document_id or new.name is distinct from old.name
        or new.issuer is distinct from old.issuer or new.training_period is distinct from old.training_period then
    new.verification_status := 'non_verifie';
  end if;
  return new;
end $$;

-- Version du schéma attendue par l'application (src/lib/schema-version.ts)
create or replace function public.app_schema_version()
returns integer language sql immutable set search_path = public as $$ select 14 $$;
revoke all on function public.app_schema_version() from public, anon;
grant execute on function public.app_schema_version() to authenticated, service_role;

notify pgrst, 'reload schema';
