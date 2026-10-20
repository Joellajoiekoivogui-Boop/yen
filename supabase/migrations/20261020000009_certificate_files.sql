-- =============================================================================
-- Migration 9 : justificatifs de certification en PDF ou en image
-- Les certificats peuvent être joints en PDF, JPEG, PNG ou WebP. Le CV reste
-- obligatoirement un PDF. Le type réel du fichier est contrôlé côté serveur
-- (signature) avant tout stockage.
-- =============================================================================

alter table public.candidate_documents drop constraint if exists candidate_documents_mime_type_check;
alter table public.candidate_documents
  add constraint candidate_documents_mime_type_check
  check (mime_type in ('application/pdf', 'image/jpeg', 'image/png', 'image/webp'));
alter table public.candidate_documents drop constraint if exists candidate_documents_cv_is_pdf;
alter table public.candidate_documents
  add constraint candidate_documents_cv_is_pdf check (kind <> 'cv' or mime_type = 'application/pdf');

-- Bucket privé : PDF et images (toujours sans accès public)
update storage.buckets
  set allowed_mime_types = array['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
  where id = 'candidate-documents';

-- Chemin imposé : <user_id>/<uuid>.<pdf|jpg|jpeg|png|webp>
drop policy if exists "candidate_documents_insert_own" on storage.objects;
create policy "candidate_documents_insert_own" on storage.objects for insert to authenticated
  with check (bucket_id = 'candidate-documents' and (storage.foldername(name))[1] = auth.uid()::text
              and lower(name) ~ '\.(pdf|jpe?g|png|webp)$');

-- Un nouveau justificatif (ou une modification du nom / de l'organisme) annule la
-- vérification faite par YEN ; un justificatif doit appartenir au même candidat.
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
  elsif new.document_id is distinct from old.document_id or new.name is distinct from old.name or new.issuer is distinct from old.issuer then
    new.verification_status := 'non_verifie';
  end if;
  return new;
end $$;
