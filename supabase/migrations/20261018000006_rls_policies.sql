-- =============================================================================
-- Migration 6 : Row Level Security
-- Principe : tout est refusé par défaut ; chaque accès est accordé explicitement.
-- Les masquages côté interface ne sont jamais considérés comme une protection.
-- =============================================================================
do $$
declare t text;
begin
  foreach t in array array[
    'profiles', 'permissions', 'role_permissions', 'user_roles', 'platform_settings', 'rate_limits',
    'engineering_domains', 'skills', 'occupations', 'occupation_skills',
    'candidate_profiles', 'candidate_education', 'candidate_experiences', 'candidate_projects', 'project_skills',
    'candidate_documents', 'candidate_document_texts', 'candidate_certifications', 'candidate_skills',
    'candidate_languages', 'candidate_consents',
    'assessments', 'assessment_skills', 'assessment_questions', 'assessment_options', 'assessment_attempts',
    'assessment_answers', 'skill_assessments', 'ai_analyses', 'ai_recommendations',
    'organizations', 'organization_domains', 'organization_events', 'partner_memberships',
    'job_offers', 'job_required_skills', 'applications', 'application_events', 'interviews', 'partner_feedback',
    'profile_shares', 'placements', 'info_requests', 'notifications', 'notification_deliveries',
    'internal_notes', 'audit_logs'
  ] loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- Aucun accès anonyme aux tables (sauf catalogue public et partenaires publics, plus bas)
revoke all on all tables in schema public from anon;
grant select on public.engineering_domains, public.skills, public.occupations, public.occupation_skills, public.organizations, public.organization_domains to anon;

-- -----------------------------------------------------------------------------
-- Identité
-- -----------------------------------------------------------------------------
create policy profiles_select_own on public.profiles for select to authenticated
  using (id = auth.uid() or public.has_permission('candidates.read') or public.has_permission('users.manage')
         or public.has_permission('partners.manage'));
create policy profiles_update_own on public.profiles for update to authenticated
  using (id = auth.uid() or public.has_permission('users.manage'))
  with check (id = auth.uid() or public.has_permission('users.manage'));

create policy permissions_read on public.permissions for select to authenticated using (true);
create policy role_permissions_read on public.role_permissions for select to authenticated using (true);

create policy user_roles_select on public.user_roles for select to authenticated
  using (user_id = auth.uid() or public.has_permission('roles.manage') or public.has_permission('users.manage'));
create policy user_roles_insert on public.user_roles for insert to authenticated
  with check (public.has_permission('roles.manage'));
create policy user_roles_delete on public.user_roles for delete to authenticated
  using (public.has_permission('roles.manage'));

create policy settings_select on public.platform_settings for select to authenticated using (public.is_staff());
create policy settings_update on public.platform_settings for update to authenticated
  using (public.has_permission('settings.manage')) with check (public.has_permission('settings.manage'));
-- rate_limits : aucune politique => accessible uniquement via la fonction / service_role

-- -----------------------------------------------------------------------------
-- Catalogue : lecture publique des éléments actifs, écriture catalog.manage
-- -----------------------------------------------------------------------------
create policy domains_read on public.engineering_domains for select to anon, authenticated
  using (is_active or public.has_permission('catalog.manage'));
create policy domains_write on public.engineering_domains for all to authenticated
  using (public.has_permission('catalog.manage')) with check (public.has_permission('catalog.manage'));

create policy skills_read on public.skills for select to anon, authenticated
  using (is_active or public.has_permission('catalog.manage'));
create policy skills_write on public.skills for all to authenticated
  using (public.has_permission('catalog.manage')) with check (public.has_permission('catalog.manage'));

create policy occupations_read on public.occupations for select to anon, authenticated
  using (is_active or public.has_permission('catalog.manage'));
create policy occupations_write on public.occupations for all to authenticated
  using (public.has_permission('catalog.manage')) with check (public.has_permission('catalog.manage'));

create policy occupation_skills_read on public.occupation_skills for select to anon, authenticated using (true);
create policy occupation_skills_write on public.occupation_skills for all to authenticated
  using (public.has_permission('catalog.manage')) with check (public.has_permission('catalog.manage'));

-- -----------------------------------------------------------------------------
-- Candidats : propriétaire + personnel habilité. Les partenaires n'ont AUCUN
-- accès direct : ils passent par un chargeur serveur restreint après
-- vérification de partner_can_view_candidate().
-- -----------------------------------------------------------------------------
create policy candidate_profiles_select on public.candidate_profiles for select to authenticated
  using (user_id = auth.uid() or public.has_permission('candidates.read'));
create policy candidate_profiles_update on public.candidate_profiles for update to authenticated
  using (user_id = auth.uid() or public.has_permission('candidates.manage'))
  with check (user_id = auth.uid() or public.has_permission('candidates.manage'));

do $$
declare t text;
begin
  foreach t in array array['candidate_education', 'candidate_experiences', 'candidate_projects',
                           'candidate_certifications', 'candidate_skills', 'candidate_languages'] loop
    execute format($f$
      create policy %1$s_select on public.%1$I for select to authenticated
        using (candidate_id = public.auth_candidate_id() or public.has_permission('candidates.read'));
      create policy %1$s_insert on public.%1$I for insert to authenticated
        with check (candidate_id = public.auth_candidate_id());
      create policy %1$s_update on public.%1$I for update to authenticated
        using (candidate_id = public.auth_candidate_id() or public.has_permission('assessments.review'))
        with check (candidate_id = public.auth_candidate_id() or public.has_permission('assessments.review'));
      create policy %1$s_delete on public.%1$I for delete to authenticated
        using (candidate_id = public.auth_candidate_id());
    $f$, t);
  end loop;
end $$;

create policy project_skills_select on public.project_skills for select to authenticated
  using (exists (select 1 from public.candidate_projects p where p.id = project_id
                 and (p.candidate_id = public.auth_candidate_id() or public.has_permission('candidates.read'))));
create policy project_skills_write on public.project_skills for all to authenticated
  using (exists (select 1 from public.candidate_projects p where p.id = project_id and p.candidate_id = public.auth_candidate_id()))
  with check (exists (select 1 from public.candidate_projects p where p.id = project_id and p.candidate_id = public.auth_candidate_id()));

-- Documents : le candidat lit et ajoute les siens ; le personnel habilité lit.
-- Les mises à jour (remplacement, suppression logique) passent par le serveur.
create policy documents_select on public.candidate_documents for select to authenticated
  using (candidate_id = public.auth_candidate_id() or public.has_permission('documents.read'));
create policy documents_insert on public.candidate_documents for insert to authenticated
  with check (candidate_id = public.auth_candidate_id() and uploaded_by = auth.uid());

create policy document_texts_select on public.candidate_document_texts for select to authenticated
  using (candidate_id = public.auth_candidate_id() or public.has_permission('documents.read'));

create policy consents_select on public.candidate_consents for select to authenticated
  using (candidate_id = public.auth_candidate_id() or public.has_permission('candidates.read'));
create policy consents_insert on public.candidate_consents for insert to authenticated
  with check (candidate_id = public.auth_candidate_id());
create policy consents_update on public.candidate_consents for update to authenticated
  using (candidate_id = public.auth_candidate_id()) with check (candidate_id = public.auth_candidate_id());

-- -----------------------------------------------------------------------------
-- Évaluations : les questions et clés de correction ne sont JAMAIS lisibles
-- par les candidats (distribution et correction côté serveur).
-- -----------------------------------------------------------------------------
create policy assessments_read on public.assessments for select to authenticated
  using (status = 'publie' or public.has_permission('assessments.manage') or public.has_permission('assessments.review'));
create policy assessments_write on public.assessments for all to authenticated
  using (public.has_permission('assessments.manage')) with check (public.has_permission('assessments.manage'));

create policy assessment_skills_read on public.assessment_skills for select to authenticated using (true);
create policy assessment_skills_write on public.assessment_skills for all to authenticated
  using (public.has_permission('assessments.manage')) with check (public.has_permission('assessments.manage'));

create policy questions_staff on public.assessment_questions for select to authenticated
  using (public.has_permission('assessments.manage') or public.has_permission('assessments.review'));
create policy questions_write on public.assessment_questions for all to authenticated
  using (public.has_permission('assessments.manage')) with check (public.has_permission('assessments.manage'));

create policy options_staff on public.assessment_options for select to authenticated
  using (public.has_permission('assessments.manage') or public.has_permission('assessments.review'));
create policy options_write on public.assessment_options for all to authenticated
  using (public.has_permission('assessments.manage')) with check (public.has_permission('assessments.manage'));

-- Tentatives / réponses : lecture par le propriétaire ; écriture côté serveur uniquement
create policy attempts_select on public.assessment_attempts for select to authenticated
  using (candidate_id = public.auth_candidate_id() or public.has_permission('candidates.read') or public.has_permission('assessments.review'));
create policy attempts_review on public.assessment_attempts for update to authenticated
  using (public.has_permission('assessments.review')) with check (public.has_permission('assessments.review'));

create policy answers_select on public.assessment_answers for select to authenticated
  using (exists (select 1 from public.assessment_attempts a where a.id = attempt_id
                 and (a.candidate_id = public.auth_candidate_id() or public.has_permission('assessments.review')
                      or public.has_permission('candidates.read'))));
create policy answers_review on public.assessment_answers for update to authenticated
  using (public.has_permission('assessments.review')) with check (public.has_permission('assessments.review'));

create policy skill_assessments_select on public.skill_assessments for select to authenticated
  using (candidate_id = public.auth_candidate_id() or public.has_permission('candidates.read'));
create policy skill_assessments_write on public.skill_assessments for insert to authenticated
  with check (public.has_permission('assessments.review'));
create policy skill_assessments_update on public.skill_assessments for update to authenticated
  using (public.has_permission('assessments.review')) with check (public.has_permission('assessments.review'));

-- -----------------------------------------------------------------------------
-- IA : le candidat voit ses analyses (sauf synthèses internes) ; le personnel
-- habilité voit et valide. L'écriture des résultats se fait côté serveur.
-- -----------------------------------------------------------------------------
create policy ai_analyses_select on public.ai_analyses for select to authenticated
  using ((candidate_id = public.auth_candidate_id() and kind not in ('synthese_responsable', 'resume_rapprochement'))
         or public.has_permission('candidates.read'));
create policy ai_analyses_review on public.ai_analyses for update to authenticated
  using (public.has_permission('ai.review')) with check (public.has_permission('ai.review'));

create policy ai_recs_select on public.ai_recommendations for select to authenticated
  using (candidate_id = public.auth_candidate_id() or public.has_permission('candidates.read'));
create policy ai_recs_update on public.ai_recommendations for update to authenticated
  using (candidate_id = public.auth_candidate_id() or public.has_permission('ai.review'))
  with check (candidate_id = public.auth_candidate_id() or public.has_permission('ai.review'));

-- -----------------------------------------------------------------------------
-- Partenaires
-- -----------------------------------------------------------------------------
create policy organizations_public on public.organizations for select to anon
  using (is_public and status = 'actif');
create policy organizations_select on public.organizations for select to authenticated
  using ((is_public and status = 'actif') or public.is_staff()
         or exists (select 1 from public.partner_memberships m where m.organization_id = organizations.id and m.user_id = auth.uid()));
create policy organizations_update on public.organizations for update to authenticated
  using (public.has_permission('partners.manage') or public.is_partner_member(id))
  with check (public.has_permission('partners.manage') or public.is_partner_member(id));
create policy organizations_insert on public.organizations for insert to authenticated
  with check (public.has_permission('partners.manage'));
create policy organizations_delete on public.organizations for delete to authenticated
  using (public.has_permission('partners.manage'));

create policy org_domains_read on public.organization_domains for select to anon, authenticated using (true);
create policy org_domains_write on public.organization_domains for all to authenticated
  using (public.has_permission('partners.manage') or public.is_partner_member(organization_id))
  with check (public.has_permission('partners.manage') or public.is_partner_member(organization_id));

create policy org_events_staff on public.organization_events for all to authenticated
  using (public.has_permission('partners.manage')) with check (public.has_permission('partners.manage'));

create policy memberships_select on public.partner_memberships for select to authenticated
  using (user_id = auth.uid() or public.has_permission('partners.manage'));
create policy memberships_write on public.partner_memberships for all to authenticated
  using (public.has_permission('partners.manage')) with check (public.has_permission('partners.manage'));

-- -----------------------------------------------------------------------------
-- Offres
-- -----------------------------------------------------------------------------
create policy offers_select on public.job_offers for select to authenticated
  using ((status = 'publiee' and public.auth_candidate_id() is not null)
         or public.is_staff() or public.is_partner_member(organization_id));
create policy offers_insert on public.job_offers for insert to authenticated
  with check (public.has_permission('offers.manage') or public.is_partner_member(organization_id));
create policy offers_update on public.job_offers for update to authenticated
  using (public.has_permission('offers.manage') or public.is_partner_member(organization_id))
  with check (public.has_permission('offers.manage') or public.is_partner_member(organization_id));
create policy offers_delete on public.job_offers for delete to authenticated
  using (public.has_permission('offers.manage'));

create policy offer_skills_select on public.job_required_skills for select to authenticated
  using (exists (select 1 from public.job_offers o where o.id = offer_id));  -- hérite de la visibilité de l'offre
create policy offer_skills_write on public.job_required_skills for all to authenticated
  using (exists (select 1 from public.job_offers o where o.id = offer_id
                 and (public.has_permission('offers.manage') or (public.is_partner_member(o.organization_id) and o.status in ('brouillon', 'en_validation')))))
  with check (exists (select 1 from public.job_offers o where o.id = offer_id
                 and (public.has_permission('offers.manage') or (public.is_partner_member(o.organization_id) and o.status in ('brouillon', 'en_validation')))));

-- -----------------------------------------------------------------------------
-- Candidatures et pipeline
-- -----------------------------------------------------------------------------
create policy applications_select on public.applications for select to authenticated
  using (candidate_id = public.auth_candidate_id()
         or public.has_permission('applications.manage') or public.has_permission('candidates.read')
         or (visible_to_partner and status <> 'retiree'
             and exists (select 1 from public.job_offers o where o.id = offer_id and public.is_partner_member(o.organization_id))));
create policy applications_insert on public.applications for insert to authenticated
  with check (candidate_id = public.auth_candidate_id() or public.has_permission('applications.manage'));
create policy applications_update on public.applications for update to authenticated
  using (candidate_id = public.auth_candidate_id() or public.has_permission('applications.manage')
         or (visible_to_partner and exists (select 1 from public.job_offers o where o.id = offer_id and public.is_partner_member(o.organization_id))))
  with check (candidate_id = public.auth_candidate_id() or public.has_permission('applications.manage')
         or (visible_to_partner and exists (select 1 from public.job_offers o where o.id = offer_id and public.is_partner_member(o.organization_id))));

create policy app_events_select on public.application_events for select to authenticated
  using (exists (select 1 from public.applications a where a.id = application_id
                 and ((a.candidate_id = public.auth_candidate_id() and visible_to_candidate)
                      or public.has_permission('applications.manage') or public.has_permission('candidates.read')
                      or (a.visible_to_partner and exists (select 1 from public.job_offers o where o.id = a.offer_id and public.is_partner_member(o.organization_id))))));
create policy app_events_insert on public.application_events for insert to authenticated
  with check (public.has_permission('applications.manage'));

create policy interviews_select on public.interviews for select to authenticated
  using (exists (select 1 from public.applications a where a.id = application_id
                 and (a.candidate_id = public.auth_candidate_id() or public.has_permission('applications.manage')
                      or (a.visible_to_partner and exists (select 1 from public.job_offers o where o.id = a.offer_id and public.is_partner_member(o.organization_id))))));
create policy interviews_write on public.interviews for all to authenticated
  using (public.has_permission('applications.manage')
         or exists (select 1 from public.applications a join public.job_offers o on o.id = a.offer_id
                    where a.id = application_id and a.visible_to_partner and public.is_partner_member(o.organization_id)))
  with check (public.has_permission('applications.manage')
         or exists (select 1 from public.applications a join public.job_offers o on o.id = a.offer_id
                    where a.id = application_id and a.visible_to_partner and public.is_partner_member(o.organization_id)));

create policy feedback_select on public.partner_feedback for select to authenticated
  using (public.has_permission('applications.manage') or public.has_permission('candidates.read') or author_id = auth.uid());
create policy feedback_insert on public.partner_feedback for insert to authenticated
  with check (author_id = auth.uid() and exists (select 1 from public.applications a join public.job_offers o on o.id = a.offer_id
              where a.id = application_id and a.visible_to_partner and public.is_partner_member(o.organization_id)));

create policy shares_select on public.profile_shares for select to authenticated
  using (candidate_id = public.auth_candidate_id() or public.has_permission('shares.manage')
         or public.has_permission('candidates.read') or public.is_partner_member(organization_id));
create policy shares_insert on public.profile_shares for insert to authenticated
  with check (public.has_permission('shares.manage'));
create policy shares_update on public.profile_shares for update to authenticated
  using (public.has_permission('shares.manage')) with check (public.has_permission('shares.manage'));

create policy placements_select on public.placements for select to authenticated
  using (candidate_id = public.auth_candidate_id() or public.has_permission('placements.manage')
         or public.has_permission('reports.view') or public.has_permission('candidates.read'));
create policy placements_write on public.placements for all to authenticated
  using (public.has_permission('placements.manage')) with check (public.has_permission('placements.manage'));

create policy info_requests_select on public.info_requests for select to authenticated
  using (candidate_id = public.auth_candidate_id() or public.has_permission('candidates.read'));
create policy info_requests_insert on public.info_requests for insert to authenticated
  with check (public.has_permission('candidates.manage'));
create policy info_requests_update on public.info_requests for update to authenticated
  using (candidate_id = public.auth_candidate_id() or public.has_permission('candidates.manage'))
  with check (candidate_id = public.auth_candidate_id() or public.has_permission('candidates.manage'));

-- -----------------------------------------------------------------------------
-- Notifications, notes internes, audit
-- -----------------------------------------------------------------------------
create policy notifications_own on public.notifications for select to authenticated using (user_id = auth.uid());
create policy notifications_mark_read on public.notifications for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
-- notification_deliveries : service_role uniquement

create policy notes_staff_select on public.internal_notes for select to authenticated
  using (public.has_permission('notes.manage'));
create policy notes_staff_insert on public.internal_notes for insert to authenticated
  with check (public.has_permission('notes.manage'));
create policy notes_staff_delete on public.internal_notes for delete to authenticated
  using (author_id = auth.uid() and public.has_permission('notes.manage'));

create policy audit_read on public.audit_logs for select to authenticated
  using (public.has_permission('audit.read'));
-- aucune politique d'insertion : écrit par les triggers SECURITY DEFINER et le service_role

-- Fonctions internes : non appelables par les rôles anonymes
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.audit_row_change() from public, anon, authenticated;
