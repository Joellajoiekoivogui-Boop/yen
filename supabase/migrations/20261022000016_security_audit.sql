-- =============================================================================
-- Migration 16 : corrections de l'audit de sécurité d'octobre 2026
--  1. Vue offer_organizations : lecture seule (elle permettait de modifier ou de
--     supprimer une organisation à tout utilisateur connecté).
--  2. Projets et certifications : toute modification du contenu (compétences liées,
--     technologies, résultats, liens, dates…) annule la vérification faite par YEN.
--  3. Candidatures côté partenaire : pas de retour sur une décision prise ni sur une
--     candidature retirée ; auteur, date et motif de décision jamais fournis par le partenaire.
--  4. Pipeline : un candidat ou un partenaire ne le met à jour que juste après sa propre
--     action (pas de rejeu sur une ancienne candidature).
--  5. Retours de compétences des partenaires : candidature non retirée, candidat actif,
--     plafond horaire ; seules les preuves validées par YEN sont montrées aux partenaires.
--  6. Lectures resserrées : la gestion des partenaires ne lit plus les profils des
--     candidats ; un partenaire ne voit plus les candidatures d'un compte désactivé.
--  7. Journal applicatif : actions du personnel réservées au personnel.
-- Peut être exécutée plusieurs fois sans risque.
-- =============================================================================

-- 1. Vue des employeurs : lecture seule pour les comptes connectés, rien pour les visiteurs
revoke all on public.offer_organizations from public, anon, authenticated;
grant select on public.offer_organizations to authenticated;
alter view public.offer_organizations set (security_barrier = true);

-- 2a. Projets : seul YEN vérifie ; un candidat peut seulement retirer une vérification,
--     et toute modification du contenu l'annule
create or replace function public.protect_project_verification()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_meta constant text[] := array['verification_status', 'verified_by', 'verified_at', 'verification_note', 'updated_at', 'created_at', 'source'];
begin
  if auth.uid() is null or public.has_permission('assessments.review') then return new; end if;
  if tg_op = 'INSERT' then
    new.verification_status := 'non_verifie'; new.verified_by := null; new.verified_at := null; new.verification_note := null;
    return new;
  end if;
  if (new.verification_status is distinct from old.verification_status and new.verification_status <> 'non_verifie')
     or (new.verified_by is distinct from old.verified_by and new.verified_by is not null)
     or (new.verified_at is distinct from old.verified_at and new.verified_at is not null)
     or new.verification_note is distinct from old.verification_note then
    raise exception 'La vérification d''un projet est réservée à YEN' using errcode = '42501';
  end if;
  if (to_jsonb(new) - v_meta) is distinct from (to_jsonb(old) - v_meta) then
    new.verification_status := 'non_verifie'; new.verified_by := null; new.verified_at := null;
  end if;
  return new;
end $$;

-- 2b. Compétences liées à un projet : en ajouter ou en retirer annule sa vérification
create or replace function public.reset_project_verification_on_skills()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or public.has_permission('assessments.review') then return null; end if;
  update public.candidate_projects
     set verification_status = 'non_verifie', verified_by = null, verified_at = null
   where id = coalesce(new.project_id, old.project_id) and verification_status <> 'non_verifie';
  return null;
end $$;
revoke all on function public.reset_project_verification_on_skills() from public, anon, authenticated;
drop trigger if exists project_skills_reset_verification on public.project_skills;
create trigger project_skills_reset_verification after insert or update or delete on public.project_skills
  for each row execute function public.reset_project_verification_on_skills();

-- 2c. Certifications : même règle (dates, identifiant et lien du certificat compris)
create or replace function public.protect_certification_verification()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_meta constant text[] := array['verification_status', 'updated_at', 'created_at', 'source'];
begin
  if new.document_id is not null and not exists (
    select 1 from public.candidate_documents d where d.id = new.document_id and d.candidate_id = new.candidate_id
  ) then
    raise exception 'Justificatif invalide' using errcode = '42501';
  end if;
  if auth.uid() is null or public.has_permission('assessments.review') then return new; end if;
  if tg_op = 'INSERT' then
    new.verification_status := 'non_verifie';
  elsif new.verification_status is distinct from old.verification_status and new.verification_status <> 'non_verifie' then
    raise exception 'La vérification d''une certification est réservée à YEN' using errcode = '42501';
  elsif (to_jsonb(new) - v_meta) is distinct from (to_jsonb(old) - v_meta) then
    new.verification_status := 'non_verifie';
  end if;
  return new;
end $$;

-- 3. Candidatures : contrôle des mises à jour (version de la migration 11, branche partenaire resserrée)
create or replace function public.guard_application()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_offer public.job_offers%rowtype;
  v_is_owner boolean;
  v_partner boolean;
begin
  select * into v_offer from public.job_offers where id = new.offer_id;
  v_is_owner := coalesce(new.candidate_id = public.auth_candidate_id(), false);

  -- Le partage avec un partenaire exige soit une candidature spontanée, soit le consentement.
  if new.visible_to_partner and new.origin = 'yen'
     and not public.has_consent(new.candidate_id, 'partage_partenaires') then
    raise exception 'Le candidat n''a pas consenti au partage de son profil avec les partenaires' using errcode = '42501';
  end if;

  if auth.uid() is null or public.has_permission('applications.manage') then return new; end if;

  if tg_op = 'INSERT' then
    if not v_is_owner then raise exception 'Action non autorisée' using errcode = '42501'; end if;
    if v_offer.status <> 'publiee' or (v_offer.deadline is not null and v_offer.deadline < current_date) then
      raise exception 'Cette offre n''accepte plus de candidatures' using errcode = 'P0001';
    end if;
    new.status := 'soumise'; new.origin := 'candidat'; new.visible_to_partner := true;
    new.partner_shortlisted := false; new.decided_by := null; new.decided_at := null; new.decision_reason := null;
    new.match_snapshot := null;
    return new;
  end if;

  -- Mise à jour par le candidat : uniquement le retrait de sa candidature
  if v_is_owner then
    if new.status = 'retiree' and old.status not in ('acceptee', 'refusee', 'retiree')
       and (to_jsonb(new) - 'status' - 'updated_at') = (to_jsonb(old) - 'status' - 'updated_at') then
      return new;
    end if;
    raise exception 'Vous pouvez uniquement retirer votre candidature' using errcode = '42501';
  end if;

  -- Mise à jour par un partenaire : statut (étapes de recrutement) et présélection
  v_partner := public.is_partner_member(v_offer.organization_id) and old.visible_to_partner;
  if v_partner then
    if (to_jsonb(new) - 'status' - 'partner_shortlisted' - 'decision_reason' - 'decided_at' - 'decided_by' - 'updated_at')
       is distinct from (to_jsonb(old) - 'status' - 'partner_shortlisted' - 'decision_reason' - 'decided_at' - 'decided_by' - 'updated_at') then
      raise exception 'Modification non autorisée' using errcode = '42501';
    end if;
    if old.status = 'retiree' then
      raise exception 'Cette candidature a été retirée par le candidat' using errcode = '42501';
    end if;
    if new.status is distinct from old.status then
      -- une décision prise (par le partenaire ou par YEN) ne se modifie plus depuis l'espace partenaire
      if old.status in ('acceptee', 'refusee') then
        raise exception 'La décision est déjà prise : contactez l''équipe YEN pour la modifier' using errcode = '42501';
      end if;
      if new.status not in ('proposee_partenaire', 'entretien_programme', 'attente_decision', 'acceptee', 'refusee') then
        raise exception 'Statut non autorisé pour un partenaire' using errcode = '42501';
      end if;
    end if;
    -- l'auteur, la date et le motif d'une décision ne sont jamais fournis par le partenaire :
    -- ils ne changent qu'avec sa propre décision (acceptée ou refusée)
    if new.status in ('acceptee', 'refusee') and new.status is distinct from old.status then
      new.decided_by := auth.uid(); new.decided_at := now();
      new.decision_reason := left(new.decision_reason, 2000);
    else
      new.decided_by := old.decided_by; new.decided_at := old.decided_at; new.decision_reason := old.decision_reason;
    end if;
    return new;
  end if;

  raise exception 'Action non autorisée' using errcode = '42501';
end $$;


-- 4. Pipeline : action du candidat ou du partenaire sur une candidature qu'il vient de modifier
create or replace function public.sync_application_pipeline(p_application uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  r record;
  v_next text;
  v_current text;
  v_fresh boolean;
begin
  select a.candidate_id, a.status::text as status, a.visible_to_partner, a.updated_at, o.offer_type::text as offer_type, o.organization_id into r
  from public.applications a join public.job_offers o on o.id = a.offer_id where a.id = p_application;
  if not found then return; end if;
  v_fresh := r.updated_at > now() - interval '15 minutes';
  if not (
    public.has_permission('applications.manage')
    or (v_fresh and r.status <> 'retiree' and r.visible_to_partner and public.is_partner_member(r.organization_id))
    or (v_fresh and coalesce(r.candidate_id = public.auth_candidate_id(), false) and r.status in ('soumise', 'retiree'))
  ) then
    raise exception 'Action non autorisée' using errcode = '42501';
  end if;
  v_next := case r.status
    when 'soumise' then 'candidature_transmise'
    when 'preselectionnee' then 'preselectionne'
    when 'proposee_partenaire' then 'proposition_envoyee'
    when 'entretien_programme' then 'entretien_programme'
    when 'attente_decision' then 'attente_decision'
    when 'acceptee' then case when r.offer_type = 'stage' then 'stage_obtenu' else 'emploi_obtenu' end
    when 'refusee' then 'candidature_refusee'
    when 'retiree' then 'candidature_retiree'
  end;
  if v_next is null then return; end if;
  select pipeline_status::text into v_current from public.candidate_profiles where id = r.candidate_id;
  if v_current in ('stage_obtenu', 'emploi_obtenu', 'suivi_post_placement')
     and v_next not in ('stage_obtenu', 'emploi_obtenu', 'suivi_post_placement') then
    return;
  end if;
  perform public._as_service(auth.uid());
  update public.candidate_profiles set pipeline_status = v_next::public.pipeline_status where id = r.candidate_id;
end $$;
revoke all on function public.sync_application_pipeline(uuid) from public, anon;
grant execute on function public.sync_application_pipeline(uuid) to authenticated, service_role;

-- 5a. Retours de compétences d'un partenaire : candidature active, candidat actif, plafond horaire
create or replace function public.add_partner_skill_feedback(p_application uuid, p_context text, p_ratings jsonb)
returns integer language plpgsql security definer set search_path = public as $$
declare
  v_candidate uuid;
  n integer;
begin
  select a.candidate_id into v_candidate
  from public.applications a
  join public.job_offers o on o.id = a.offer_id
  join public.candidate_profiles cp on cp.id = a.candidate_id
  join public.profiles p on p.id = cp.user_id
  where a.id = p_application and a.visible_to_partner and a.status <> 'retiree' and p.is_active
    and public.is_partner_member(o.organization_id);
  if v_candidate is null then raise exception 'Action non autorisée' using errcode = '42501'; end if;
  if jsonb_typeof(coalesce(p_ratings, '[]'::jsonb)) <> 'array' or jsonb_array_length(coalesce(p_ratings, '[]'::jsonb)) > 30 then
    raise exception 'Évaluations invalides.';
  end if;
  if not public.check_rate_limit('partner-feedback:' || auth.uid()::text, 20, 3600) then
    raise exception 'Trop de retours envoyés en peu de temps. Réessayez plus tard.' using errcode = 'P0001';
  end if;
  insert into public.skill_assessments (candidate_id, skill_id, level, source, confidence, status, notes)
  select v_candidate, s.id,
         case when r ->> 'level' = 'expert' then 'avance' else r ->> 'level' end::public.skill_level,
         'retour_partenaire', 'moyenne', 'en_attente',
         left(format('Retour partenaire (%s)%s', left(coalesce(p_context, ''), 100),
                     case when coalesce(r ->> 'comment', '') <> '' then ' : ' || (r ->> 'comment') else '' end), 2000)
  from jsonb_array_elements(coalesce(p_ratings, '[]'::jsonb)) r
  join public.skills s on s.id::text = r ->> 'skill_id'
  where r ->> 'level' in ('debutant', 'intermediaire', 'avance', 'expert');
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.add_partner_skill_feedback(uuid, text, jsonb) from public, anon;
grant execute on function public.add_partner_skill_feedback(uuid, text, jsonb) to authenticated, service_role;

-- 5b. Données d'un candidat montrées à un partenaire : seulement les preuves validées par YEN
--     (un retour « en attente » d'un autre partenaire n'est plus visible)
create or replace function public.partner_candidate_data(p_candidate uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  c record;
begin
  if not public.partner_can_view_candidate(p_candidate) then return null; end if;
  select cp.id, cp.public_code, cp.headline, cp.summary, cp.education_level, cp.yen_program, cp.availability, cp.opportunity_types,
         d.name as domain, p.first_name, p.last_name, p.city
    into c
  from public.candidate_profiles cp
  join public.profiles p on p.id = cp.user_id
  left join public.engineering_domains d on d.id = cp.primary_domain_id
  where cp.id = p_candidate;
  if not found then return null; end if;
  return jsonb_build_object(
    'id', c.id, 'public_code', c.public_code, 'headline', c.headline, 'summary', c.summary,
    'education_level', c.education_level, 'yen_program', c.yen_program, 'availability', c.availability,
    'opportunity_types', to_jsonb(c.opportunity_types), 'domain', c.domain,
    'first_name', c.first_name, 'last_name', c.last_name, 'city', c.city,
    'skill_assessments', coalesce((select jsonb_agg(jsonb_build_object(
        'id', s.id, 'skill_id', s.skill_id, 'skill_name', sk.name, 'level', s.level, 'score_percent', s.score_percent,
        'source', s.source, 'status', s.status, 'attempt_id', s.attempt_id, 'project_id', s.project_id, 'assessed_at', s.assessed_at))
      from public.skill_assessments s join public.skills sk on sk.id = s.skill_id where s.candidate_id = p_candidate and s.status = 'valide'), '[]'::jsonb),
    'declared', coalesce((select jsonb_agg(jsonb_build_object('skill_id', cs.skill_id, 'self_level', cs.self_level, 'name', sk.name))
      from public.candidate_skills cs join public.skills sk on sk.id = cs.skill_id where cs.candidate_id = p_candidate), '[]'::jsonb),
    'projects', coalesce((select jsonb_agg(jsonb_build_object('title', pr.title, 'description', pr.description, 'technologies', to_jsonb(pr.technologies),
        'verification_status', pr.verification_status, 'outcomes', pr.outcomes))
      from public.candidate_projects pr where pr.candidate_id = p_candidate and pr.verification_status <> 'rejete'), '[]'::jsonb),
    'experiences', coalesce((select jsonb_agg(jsonb_build_object('title', e.title, 'organization', e.organization, 'start_date', e.start_date,
        'end_date', e.end_date, 'is_current', e.is_current, 'description', e.description) order by e.start_date desc)
      from public.candidate_experiences e where e.candidate_id = p_candidate), '[]'::jsonb),
    'education', coalesce((select jsonb_agg(jsonb_build_object('degree', ed.degree, 'institution', ed.institution, 'end_year', ed.end_year))
      from public.candidate_education ed where ed.candidate_id = p_candidate), '[]'::jsonb),
    'certifications', coalesce((select jsonb_agg(jsonb_build_object('name', ce.name, 'issuer', ce.issuer, 'verification_status', ce.verification_status))
      from public.candidate_certifications ce where ce.candidate_id = p_candidate and ce.verification_status <> 'rejete'), '[]'::jsonb),
    'languages', coalesce((select jsonb_agg(jsonb_build_object('language', l.language, 'proficiency', l.proficiency))
      from public.candidate_languages l where l.candidate_id = p_candidate), '[]'::jsonb),
    'has_cv', exists (select 1 from public.candidate_documents doc
                      where doc.candidate_id = p_candidate and doc.kind = 'cv' and doc.is_current and doc.deleted_at is null),
    'can_download_cv', public.partner_can_view_cv(p_candidate),
    'results', coalesce((select jsonb_agg(jsonb_build_object('title', a.title, 'score_percent', at.score_percent, 'passed', at.passed, 'graded_at', at.graded_at)
        order by at.graded_at desc)
      from public.assessment_attempts at join public.assessments a on a.id = at.assessment_id
      where at.candidate_id = p_candidate and at.status = 'corrige'), '[]'::jsonb)
  );
end $$;
revoke all on function public.partner_candidate_data(uuid) from public, anon;
grant execute on function public.partner_candidate_data(uuid) to authenticated, service_role;

-- 6a. Profils : la gestion des partenaires lit les comptes partenaires, plus ceux des candidats
drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles for select to authenticated
  using (id = auth.uid() or public.has_permission('candidates.read') or public.has_permission('users.manage')
         or (public.has_permission('partners.manage')
             and (account_type = 'partner' or exists (select 1 from public.partner_memberships m where m.user_id = profiles.id))));

-- 6b. Candidatures : un partenaire ne voit plus celles d'un compte candidat désactivé
--     (fonction appelable par les règles d'accès : elle indique seulement si le compte est actif)
create or replace function public.candidate_account_active(p_candidate uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public._candidate_is_active(p_candidate)
$$;
revoke all on function public.candidate_account_active(uuid) from public, anon;
grant execute on function public.candidate_account_active(uuid) to authenticated, service_role;
drop policy if exists applications_select on public.applications;
create policy applications_select on public.applications for select to authenticated
  using (candidate_id = public.auth_candidate_id()
         or public.has_permission('applications.manage') or public.has_permission('candidates.read')
         or (visible_to_partner and status <> 'retiree'
             and exists (select 1 from public.job_offers o where o.id = offer_id and public.is_partner_member(o.organization_id))
             and public.candidate_account_active(candidate_id)));

-- 7. Journal applicatif : les actions propres au personnel YEN ne peuvent plus être écrites
--    par un candidat ou un partenaire ; ajout des décisions sur les demandes partenaires
create or replace function public.log_audit(p_action text, p_entity_type text, p_entity_id text default null, p_details jsonb default '{}'::jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return; end if;
  if p_entity_type !~ '^[a-z_]{2,64}$'
     or not (
       p_action in (
         'certificate_file_rejected', 'cv_rejected', 'deletion_requested', 'document_downloaded', 'offer_status_changed',
         'partner_cv_downloaded', 'partner_profile_viewed', 'password_changed', 'profile_exported', 'sessions_revoked'
       )
       or (public.is_staff() and p_action in (
         'ai_recomputed', 'attempt_reviewed', 'candidate_shortlisted', 'certification_verification',
         'partner_member_approved', 'partner_member_revoked', 'partner_request_approved', 'partner_request_rejected',
         'report_exported', 'talents_exported'
       ))
     ) then
    raise exception 'Entrée de journal invalide';
  end if;
  if not public.check_rate_limit('audit:' || auth.uid()::text, 200, 3600) then return; end if;
  insert into public.audit_logs (actor_id, action, entity_type, entity_id, details)
  values (auth.uid(), p_action, p_entity_type, left(p_entity_id, 100),
          case when p_details is null or pg_column_size(p_details) > 8000 then '{}'::jsonb else p_details end);
end $$;
revoke all on function public.log_audit(text, text, text, jsonb) from public, anon;
grant execute on function public.log_audit(text, text, text, jsonb) to authenticated, service_role;

-- Version du schéma attendue par l'application (src/lib/schema-version.ts)
create or replace function public.app_schema_version()
returns integer language sql immutable set search_path = public as $$ select 16 $$;
revoke all on function public.app_schema_version() from public, anon;
grant execute on function public.app_schema_version() to authenticated, service_role;

notify pgrst, 'reload schema';
