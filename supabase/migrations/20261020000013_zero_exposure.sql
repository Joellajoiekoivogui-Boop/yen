-- =============================================================================
-- Migration 13 : surface d'exposition minimale
--  - aucun texte libre de notification fourni par un candidat ou un partenaire :
--    les messages sont rédigés en base à partir d'événements vérifiés ;
--  - le pipeline automatique est calculé en base (aucune valeur du client) ;
--  - journal applicatif limité aux actions connues ;
--  - privilèges par liste blanche : rien pour les visiteurs hormis le catalogue
--    public, et seulement les fonctions utiles pour les comptes connectés.
-- Idempotente.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Notifications à texte libre : réservées au personnel YEN
-- -----------------------------------------------------------------------------
create or replace function public.notify_candidate(p_candidate uuid, p_category text, p_title text, p_body text default '', p_link text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_staff() then raise exception 'Action non autorisée' using errcode = '42501'; end if;
  perform public._notify((select user_id from public.candidate_profiles where id = p_candidate), p_category, p_title, p_body, p_link);
end $$;

create or replace function public.notify_organization(p_organization uuid, p_category text, p_title text, p_body text default '', p_link text default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  r record;
begin
  if not public.is_staff() then raise exception 'Action non autorisée' using errcode = '42501'; end if;
  for r in select m.user_id from public.partner_memberships m where m.organization_id = p_organization and m.status = 'actif' loop
    perform public._notify(r.user_id, p_category, p_title, p_body, p_link);
  end loop;
end $$;

create or replace function public.notify_staff(p_permission text, p_category text, p_title text, p_body text default '', p_link text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_staff() then raise exception 'Action non autorisée' using errcode = '42501'; end if;
  perform public._notify_permission(p_permission, p_category, p_title, p_body, p_link);
end $$;

create or replace function public._application_status_label(p_status text)
returns text language sql immutable set search_path = public as $$
  select case p_status
    when 'soumise' then 'Soumise' when 'en_revue' then 'En revue par YEN' when 'preselectionnee' then 'Présélectionnée'
    when 'proposee_partenaire' then 'Proposée au partenaire' when 'entretien_programme' then 'Entretien programmé'
    when 'attente_decision' then 'En attente de décision' when 'acceptee' then 'Acceptée' when 'refusee' then 'Refusée'
    when 'retiree' then 'Retirée' else p_status end
$$;

-- Notifications déclenchées par un candidat ou un partenaire : seul l'événement
-- est fourni ; destinataires, titre, texte et lien sont déterminés ici, après
-- vérification que l'appelant est bien l'auteur de l'événement. Chaque
-- événement ne notifie qu'une fois (pas de rejeu).
create or replace function public.notify_event(p_event text, p_ref uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  r record;
  m record;
  v_label text;
begin
  if auth.uid() is null then raise exception 'Action non autorisée' using errcode = '42501'; end if;

  if p_event in ('application_submitted', 'application_withdrawn', 'partner_status_update') then
    select a.id, a.candidate_id, a.status::text as status, a.offer_id, a.visible_to_partner, o.title, o.organization_id,
           cp.user_id as candidate_user
      into r
    from public.applications a
    join public.job_offers o on o.id = a.offer_id
    join public.candidate_profiles cp on cp.id = a.candidate_id
    where a.id = p_ref;
    if not found then raise exception 'Action non autorisée' using errcode = '42501'; end if;

    if p_event = 'partner_status_update' then
      if not (r.visible_to_partner and public.is_partner_member(r.organization_id)) then
        raise exception 'Action non autorisée' using errcode = '42501';
      end if;
      if not public.check_rate_limit('event:' || p_event || ':' || p_ref::text || ':' || r.status, 1, 86400) then return; end if;
      v_label := public._application_status_label(r.status);
      perform public._notify(r.candidate_user, case when r.status in ('acceptee', 'refusee') then 'decision' else 'candidature' end,
                             format('Candidature « %s » : %s', r.title, v_label), '', '/candidat/candidatures');
      perform public._notify_permission('applications.manage', 'candidature', 'Mise à jour partenaire : ' || v_label, r.title, '/admin/candidatures');
      return;
    end if;

    if not coalesce(r.candidate_id = public.auth_candidate_id(), false)
       or (p_event = 'application_submitted' and r.status <> 'soumise')
       or (p_event = 'application_withdrawn' and r.status <> 'retiree') then
      raise exception 'Action non autorisée' using errcode = '42501';
    end if;
    if not public.check_rate_limit('event:' || p_event || ':' || p_ref::text, 1, 86400) then return; end if;
    for m in select pm.user_id from public.partner_memberships pm where pm.organization_id = r.organization_id and pm.status = 'actif' loop
      perform public._notify(m.user_id, 'candidature',
        case when p_event = 'application_submitted' then 'Nouvelle candidature' else 'Candidature retirée' end,
        r.title, case when p_event = 'application_submitted' then '/partenaire/candidatures/' || r.id::text end);
    end loop;
    if p_event = 'application_submitted' then
      perform public._notify_permission('applications.manage', 'candidature', 'Nouvelle candidature', r.title, '/admin/candidatures?offre=' || r.offer_id::text);
    end if;

  elsif p_event = 'interview_scheduled' then
    select i.id, i.scheduled_at, i.mode, i.location, a.visible_to_partner, o.title, o.organization_id, cp.user_id as candidate_user
      into r
    from public.interviews i
    join public.applications a on a.id = i.application_id
    join public.job_offers o on o.id = a.offer_id
    join public.candidate_profiles cp on cp.id = a.candidate_id
    where i.id = p_ref;
    if not found or not (public.has_permission('applications.manage') or (r.visible_to_partner and public.is_partner_member(r.organization_id))) then
      raise exception 'Action non autorisée' using errcode = '42501';
    end if;
    if not public.check_rate_limit('event:' || p_event || ':' || p_ref::text, 1, 86400) then return; end if;
    perform public._notify(r.candidate_user, 'entretien', 'Entretien programmé : ' || r.title,
      format('%s — %s.', to_char(r.scheduled_at at time zone 'Africa/Conakry', 'DD/MM/YYYY à HH24:MI'),
             case r.mode when 'presentiel' then 'en présentiel' || coalesce(' (' || nullif(r.location, '') || ')', '')
                         when 'visio' then 'en visioconférence' else 'par téléphone' end),
      '/candidat/candidatures');

  elsif p_event = 'partner_feedback' then
    if not exists (select 1 from public.partner_feedback f where f.id = p_ref and f.author_id = auth.uid()) then
      raise exception 'Action non autorisée' using errcode = '42501';
    end if;
    if not public.check_rate_limit('event:' || p_event || ':' || p_ref::text, 1, 86400) then return; end if;
    perform public._notify_permission('assessments.review', 'candidature', 'Retour partenaire à examiner', '', '/admin/corrections');

  elsif p_event = 'offer_submitted' then
    select o.id, o.title, o.status, o.organization_id into r from public.job_offers o where o.id = p_ref;
    if not found or r.status <> 'en_validation' or not public.is_partner_member(r.organization_id) then
      raise exception 'Action non autorisée' using errcode = '42501';
    end if;
    if not public.check_rate_limit('event:' || p_event || ':' || p_ref::text, 1, 86400) then return; end if;
    perform public._notify_permission('offers.manage', 'offre', 'Offre à valider', r.title, '/admin/offres/' || r.id::text);

  else
    raise exception 'Événement inconnu';
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- 2. Pipeline automatique calculé en base (mêmes règles que completion.ts)
-- -----------------------------------------------------------------------------
create or replace function public._candidate_completion(p_candidate uuid)
returns integer language sql stable security definer set search_path = public as $$
  select (
      case when coalesce(p.first_name, '') <> '' and coalesce(p.last_name, '') <> '' and coalesce(p.city, '') <> '' then 10 else 0 end
    + case when coalesce(c.institution, '') <> '' and coalesce(c.yen_program, '') <> '' and coalesce(c.education_level, '') <> '' then 10 else 0 end
    + case when c.primary_domain_id is not null and cardinality(c.opportunity_types) > 0 then 10 else 0 end
    + case when btrim(coalesce(c.headline, '')) <> '' and char_length(btrim(coalesce(c.summary, ''))) >= 80 then 15 else 0 end
    + case when exists (select 1 from public.candidate_documents d where d.candidate_id = c.id and d.kind = 'cv' and d.is_current and d.deleted_at is null) then 15 else 0 end
    + case when (select count(*) from public.candidate_skills s where s.candidate_id = c.id) >= 3 then 15 else 0 end
    + case when exists (select 1 from public.candidate_education e where e.candidate_id = c.id) then 10 else 0 end
    + case when exists (select 1 from public.candidate_experiences x where x.candidate_id = c.id)
             or exists (select 1 from public.candidate_projects pr where pr.candidate_id = c.id) then 10 else 0 end
    + case when (select count(*) from public.candidate_consents k where k.candidate_id = c.id and k.consent_type <> 'conditions_utilisation') >= 3 then 5 else 0 end
  )::integer
  from public.candidate_profiles c join public.profiles p on p.id = c.user_id
  where c.id = p_candidate
$$;

drop function if exists public.set_auto_pipeline_status(uuid, text);
create or replace function public.refresh_auto_pipeline(p_candidate uuid)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_next text;
begin
  if not (coalesce(p_candidate = public.auth_candidate_id(), false) or public.is_staff()) then
    raise exception 'Action non autorisée' using errcode = '42501';
  end if;
  v_next := case when coalesce(public._candidate_completion(p_candidate), 0) >= 70 then 'en_evaluation' else 'profil_incomplet' end;
  perform public._as_service(auth.uid());
  update public.candidate_profiles set pipeline_status = v_next::public.pipeline_status
   where id = p_candidate and pipeline_status in ('profil_incomplet', 'en_evaluation')
     and pipeline_status <> v_next::public.pipeline_status;
  return v_next;
end $$;

-- -----------------------------------------------------------------------------
-- 3. Journal applicatif : uniquement les actions connues de l'application
-- -----------------------------------------------------------------------------
create or replace function public.log_audit(p_action text, p_entity_type text, p_entity_id text default null, p_details jsonb default '{}'::jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return; end if;
  if p_action not in (
       'ai_recomputed', 'attempt_reviewed', 'candidate_shortlisted', 'certificate_file_rejected', 'certification_verification',
       'cv_rejected', 'deletion_requested', 'document_downloaded', 'offer_status_changed', 'partner_cv_downloaded',
       'partner_profile_viewed', 'password_changed', 'profile_exported', 'report_exported', 'sessions_revoked',
       'talents_exported', 'partner_member_approved', 'partner_member_revoked'
     ) or p_entity_type !~ '^[a-z_]{2,64}$' then
    raise exception 'Entrée de journal invalide';
  end if;
  if not public.check_rate_limit('audit:' || auth.uid()::text, 200, 3600) then return; end if;
  insert into public.audit_logs (actor_id, action, entity_type, entity_id, details)
  values (auth.uid(), p_action, p_entity_type, left(p_entity_id, 100),
          case when p_details is null or pg_column_size(p_details) > 8000 then '{}'::jsonb else p_details end);
end $$;

-- -----------------------------------------------------------------------------
-- 4. Privilèges par liste blanche
-- -----------------------------------------------------------------------------
-- Fonctions : rien pour les visiteurs ; pour les comptes connectés, uniquement
-- les fonctions des politiques RLS et celles qu'appelle l'application.
revoke execute on all functions in schema public from public, anon, authenticated;
do $$
declare
  f record;
begin
  for f in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = any (array[
      -- utilisées par les politiques RLS, les vues et le stockage
      'auth_candidate_id', 'has_permission', 'is_staff', 'is_partner_member', 'partner_can_read_cv_object',
      -- appelées par l'application
      'current_permissions', 'admin_overview_stats', 'insertion_report',
      'start_assessment_attempt', 'get_attempt_questions', 'submit_assessment_attempt', 'finalize_assessment_review', 'get_attempt_review',
      'register_cv_document', 'retire_candidate_document', 'set_current_cv', 'attach_certificate_document',
      'refresh_auto_pipeline', 'sync_application_pipeline', 'confirm_placement_pipeline', 'hide_application_event', 'add_partner_skill_feedback',
      'partner_candidate_data', 'partner_candidate_codes', 'partner_cv_document',
      'sync_partner_role', 'revoke_user_sessions', 'rate_limit_hit', 'log_audit',
      'notify_user', 'notify_candidate', 'notify_organization', 'notify_staff', 'notify_candidates_by_domain', 'notify_event'
    ])
  loop
    execute format('grant execute on function %s to authenticated, service_role', f.sig);
  end loop;
end $$;

-- Tables : les visiteurs ne lisent que le catalogue public et la vitrine des partenaires
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
grant select on public.engineering_domains, public.skills, public.occupations, public.occupation_skills,
                public.assessments, public.platform_settings to anon;
grant select (id, name, sector, description, city, country, website, partnership_type, is_public, status, is_demo) on public.organizations to anon;

-- Objets créés plus tard : aucun droit implicite pour les visiteurs ni pour PUBLIC
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on sequences from anon;
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 5. Catalogue : la règle des visiteurs n'appelle aucune fonction (ils n'en
--    exécutent plus) ; le personnel garde l'accès aux éléments inactifs.
-- -----------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['engineering_domains', 'skills', 'occupations'] loop
    execute format('drop policy if exists %I on public.%I', case t when 'engineering_domains' then 'domains_read' else t || '_read' end, t);
    execute format('drop policy if exists %I on public.%I', t || '_public_read', t);
    execute format('drop policy if exists %I on public.%I', t || '_member_read', t);
    execute format('create policy %I on public.%I for select to anon using (is_active)', t || '_public_read', t);
    execute format('create policy %I on public.%I for select to authenticated using (is_active or public.has_permission(''catalog.manage''))', t || '_member_read', t);
  end loop;
end $$;

-- -----------------------------------------------------------------------------
-- 6. Stockage : compte actif exigé pour lire ou supprimer ses fichiers, et
--    40 fichiers au plus par compte (pas d'hébergement de fichiers détourné).
-- -----------------------------------------------------------------------------
create or replace function public._storage_quota_ok()
returns boolean language sql stable security definer set search_path = public as $$
  select (select count(*) from storage.objects o
          where o.bucket_id = 'candidate-documents' and (storage.foldername(o.name))[1] = auth.uid()::text) < 40
$$;
create or replace function public._is_active_user()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_active)
$$;
revoke all on function public._storage_quota_ok() from public, anon;
revoke all on function public._is_active_user() from public, anon;
grant execute on function public._storage_quota_ok() to authenticated, service_role;
grant execute on function public._is_active_user() to authenticated, service_role;

drop policy if exists "candidate_documents_insert_own" on storage.objects;
create policy "candidate_documents_insert_own" on storage.objects for insert to authenticated
  with check (bucket_id = 'candidate-documents' and (storage.foldername(name))[1] = auth.uid()::text
              and lower(name) ~ '\.(pdf|jpe?g|png|webp)$'
              and public._is_active_user() and public._storage_quota_ok());

drop policy if exists "candidate_documents_select" on storage.objects;
create policy "candidate_documents_select" on storage.objects for select to authenticated
  using (bucket_id = 'candidate-documents'
         and (((storage.foldername(name))[1] = auth.uid()::text and public._is_active_user())
              or public.has_permission('documents.read')));

drop policy if exists "candidate_documents_delete_own" on storage.objects;
create policy "candidate_documents_delete_own" on storage.objects for delete to authenticated
  using (bucket_id = 'candidate-documents' and (storage.foldername(name))[1] = auth.uid()::text and public._is_active_user());
