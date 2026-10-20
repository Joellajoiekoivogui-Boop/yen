-- =============================================================================
-- Migration 12 : durcissement de sécurité (audit d'octobre 2026)
-- Chaque point correspond à un constat vérifié de l'audit. Idempotente.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Compte désactivé = plus aucun accès candidat (RLS, fonctions, stockage,
--    visibilité par les partenaires), et fermeture de ses sessions.
-- -----------------------------------------------------------------------------
create or replace function public.auth_candidate_id()
returns uuid language sql stable security definer set search_path = public as $$
  select cp.id from public.candidate_profiles cp
  join public.profiles p on p.id = cp.user_id
  where cp.user_id = auth.uid() and p.is_active
$$;

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles for update to authenticated
  using ((id = auth.uid() and is_active) or public.has_permission('users.manage'))
  with check ((id = auth.uid() and is_active) or public.has_permission('users.manage'));

drop policy if exists candidate_profiles_update on public.candidate_profiles;
create policy candidate_profiles_update on public.candidate_profiles for update to authenticated
  using (id = public.auth_candidate_id() or public.has_permission('candidates.manage'))
  with check (id = public.auth_candidate_id() or public.has_permission('candidates.manage'));

drop policy if exists "candidate_documents_insert_own" on storage.objects;
create policy "candidate_documents_insert_own" on storage.objects for insert to authenticated
  with check (bucket_id = 'candidate-documents' and (storage.foldername(name))[1] = auth.uid()::text
              and lower(name) ~ '\.(pdf|jpe?g|png|webp)$'
              and exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_active));

create or replace function public._candidate_is_active(p_candidate uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.candidate_profiles cp join public.profiles p on p.id = cp.user_id
                 where cp.id = p_candidate and p.is_active)
$$;
revoke all on function public._candidate_is_active(uuid) from public, anon, authenticated;

create or replace function public.partner_can_view_candidate(p_candidate uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public._candidate_is_active(p_candidate) and (
    exists (
      select 1 from public.applications a
      join public.job_offers o on o.id = a.offer_id
      where a.candidate_id = p_candidate and a.visible_to_partner
        and a.status <> 'retiree'
        and public.is_partner_member(o.organization_id)
    ) or exists (
      select 1 from public.profile_shares s
      where s.candidate_id = p_candidate and s.revoked_at is null and s.expires_at > now()
        and public.is_partner_member(s.organization_id)
        and public.has_consent(p_candidate, 'partage_partenaires')
    )
  )
$$;

create or replace function public.partner_can_view_cv(p_candidate uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public._candidate_is_active(p_candidate) and (
    exists (
      select 1 from public.applications a
      join public.job_offers o on o.id = a.offer_id
      where a.candidate_id = p_candidate and a.visible_to_partner and a.status <> 'retiree'
        and public.is_partner_member(o.organization_id)
    ) or exists (
      select 1 from public.profile_shares s
      where s.candidate_id = p_candidate and s.include_cv and s.revoked_at is null and s.expires_at > now()
        and public.is_partner_member(s.organization_id)
        and public.has_consent(p_candidate, 'partage_partenaires')
    )
  )
$$;

-- Fermeture des sessions d'un compte (désactivation) sans clé de service
create or replace function public.revoke_user_sessions(p_user uuid)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if not public.has_permission('users.manage') then
    raise exception 'Permission users.manage requise' using errcode = '42501';
  end if;
  begin
    execute 'delete from auth.sessions where user_id = $1' using p_user;
    return true;
  exception when undefined_table or insufficient_privilege then
    -- l'accès reste bloqué par les contrôles is_active ; le jeton expire de lui-même
    return false;
  end;
end $$;
revoke all on function public.revoke_user_sessions(uuid) from public, anon;
grant execute on function public.revoke_user_sessions(uuid) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 2. Notifications : liens internes strictement filtrés, envois limités
-- -----------------------------------------------------------------------------
create or replace function public._safe_link(p_link text)
returns text language sql immutable set search_path = public as $$
  select case when p_link ~ '^/[A-Za-z0-9/_?=&%.#~+,-]*$' and p_link !~ '^//' then left(p_link, 500) end
$$;

create or replace function public._notify(p_user uuid, p_category text, p_title text, p_body text, p_link text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_user is null then return; end if;
  insert into public.notifications (user_id, category, title, body, link)
  values (p_user, p_category, left(coalesce(p_title, ''), 200), left(coalesce(p_body, ''), 2000), public._safe_link(p_link));
end $$;
revoke all on function public._notify(uuid, text, text, text, text) from public, anon, authenticated;

create or replace function public.notify_candidate(p_candidate uuid, p_category text, p_title text, p_body text default '', p_link text default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_staff boolean := public.is_staff();
begin
  if not (
    v_staff
    or coalesce(p_candidate = public.auth_candidate_id(), false)
    or exists (
      select 1 from public.applications a join public.job_offers o on o.id = a.offer_id
      where a.candidate_id = p_candidate and a.visible_to_partner and public.is_partner_member(o.organization_id)
    )
  ) then
    raise exception 'Action non autorisée' using errcode = '42501';
  end if;
  if not v_staff and not public.check_rate_limit('notify:' || auth.uid()::text, 60, 3600) then return; end if;
  perform public._notify((select user_id from public.candidate_profiles where id = p_candidate), p_category, p_title, p_body, p_link);
end $$;

create or replace function public.notify_organization(p_organization uuid, p_category text, p_title text, p_body text default '', p_link text default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_staff boolean := public.is_staff();
  r record;
begin
  if not (
    v_staff
    or public.is_partner_member(p_organization)
    or exists (
      select 1 from public.applications a join public.job_offers o on o.id = a.offer_id
      where o.organization_id = p_organization and a.candidate_id = public.auth_candidate_id()
    )
  ) then
    raise exception 'Action non autorisée' using errcode = '42501';
  end if;
  if not v_staff and not public.check_rate_limit('notify:' || auth.uid()::text, 60, 3600) then return; end if;
  for r in select m.user_id from public.partner_memberships m where m.organization_id = p_organization and m.status = 'actif' loop
    perform public._notify(r.user_id, p_category, p_title, p_body, p_link);
  end loop;
end $$;

-- -----------------------------------------------------------------------------
-- 3. Évaluations : une tentative abandonnée expire (et compte pour le délai
--    entre deux tentatives) au lieu de permettre d'en ouvrir une autre aussitôt.
-- -----------------------------------------------------------------------------
create or replace function public.start_assessment_attempt(p_assessment uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_candidate uuid := public.auth_candidate_id();
  a record;
  v_open uuid;
  v_done integer;
  v_last timestamptz;
  v_next timestamptz;
  v_id uuid;
begin
  if v_candidate is null then raise exception 'Action réservée aux candidats.' using errcode = '42501'; end if;
  select s.id, s.version, s.duration_minutes, s.max_attempts, s.cooldown_hours into a
  from public.assessments s where s.id = p_assessment and s.status = 'publie';
  if not found then raise exception 'Cette évaluation n''est pas disponible.'; end if;
  perform pg_advisory_xact_lock(hashtext('attempt:' || v_candidate::text || ':' || a.id::text));

  update public.assessment_attempts set status = 'expire', submitted_at = deadline_at
   where assessment_id = a.id and candidate_id = v_candidate and status = 'en_cours'
     and deadline_at + interval '5 minutes' <= now();

  select t.id into v_open from public.assessment_attempts t
  where t.assessment_id = a.id and t.candidate_id = v_candidate and t.status = 'en_cours'
  order by t.started_at desc limit 1;
  if v_open is not null then return v_open; end if;

  select count(*), max(t.submitted_at) into v_done, v_last from public.assessment_attempts t
  where t.assessment_id = a.id and t.candidate_id = v_candidate and t.status <> 'annule';
  if a.max_attempts is not null and v_done >= a.max_attempts then
    raise exception 'Nombre maximal de tentatives atteint (%).', a.max_attempts;
  end if;
  if v_last is not null and a.cooldown_hours > 0 then
    v_next := v_last + make_interval(hours => a.cooldown_hours);
    if v_next > now() then
      raise exception 'Vous pourrez repasser cette évaluation à partir du %.', to_char(v_next at time zone 'Africa/Conakry', 'DD/MM/YYYY à HH24:MI');
    end if;
  end if;

  insert into public.assessment_attempts (assessment_id, assessment_version, candidate_id, deadline_at)
  values (a.id, a.version, v_candidate, now() + make_interval(mins => a.duration_minutes))
  returning id into v_id;
  return v_id;
end $$;

-- Questions : plus distribuées une fois le temps imparti écoulé
create or replace function public.get_attempt_questions(p_attempt uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  t record;
begin
  select at.id, at.assessment_id, at.status, at.deadline_at into t from public.assessment_attempts at
  where at.id = p_attempt and at.candidate_id = public.auth_candidate_id();
  if not found then raise exception 'Tentative introuvable.' using errcode = '42501'; end if;
  if t.status <> 'en_cours' then raise exception 'Cette tentative n''est plus en cours.'; end if;
  if t.deadline_at + interval '5 minutes' < now() then raise exception 'Le temps imparti est dépassé.'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', q.id, 'position', q.position, 'type', q.question_type, 'prompt', q.prompt, 'points', q.points, 'rubric', q.rubric,
      'options', coalesce((select jsonb_agg(jsonb_build_object('id', o.id, 'label', o.label) order by o.position)
                           from public.assessment_options o where o.question_id = q.id), '[]'::jsonb)
    ) order by q.position)
    from public.assessment_questions q where q.assessment_id = t.assessment_id
  ), '[]'::jsonb);
end $$;

-- -----------------------------------------------------------------------------
-- 4. Documents : plus d'insertion directe ; enregistrement uniquement par des
--    fonctions qui imposent le dossier, le type et un statut de contrôle
--    plausible (« sain » est réservé à un antivirus de confiance).
-- -----------------------------------------------------------------------------
drop policy if exists documents_insert on public.candidate_documents;

create or replace function public.register_cv_document(
  p_storage_path text, p_filename text, p_size integer, p_sha256 text, p_scan_status text, p_scan_details text,
  p_page_count integer, p_text_status text, p_text text default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_candidate uuid := public.auth_candidate_id();
  v_version integer;
  v_id uuid;
  v_text_status text := case when p_text_status = 'extrait' then 'extrait' else 'ocr_requis' end;
begin
  if v_candidate is null then raise exception 'Action réservée aux candidats.' using errcode = '42501'; end if;
  if p_storage_path is null or split_part(p_storage_path, '/', 1) <> v_uid::text or p_storage_path !~* '^[^/]+/[^/]+\.pdf$' then
    raise exception 'Chemin de stockage invalide.' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtext('cv:' || v_candidate::text));
  select coalesce(max(version), 0) + 1 into v_version from public.candidate_documents where candidate_id = v_candidate and kind = 'cv';
  update public.candidate_documents set is_current = false
   where candidate_id = v_candidate and kind = 'cv' and is_current and deleted_at is null;
  insert into public.candidate_documents (
    candidate_id, kind, storage_path, original_filename, mime_type, size_bytes, sha256, version, is_current,
    scan_status, scan_details, page_count, text_extraction_status, uploaded_by
  ) values (
    v_candidate, 'cv', p_storage_path, left(coalesce(p_filename, 'cv.pdf'), 255), 'application/pdf', p_size, p_sha256, v_version, true,
    case when p_scan_status = 'non_analyse' then 'non_analyse' else 'controle_basique_ok' end,
    left(p_scan_details, 2000), p_page_count, v_text_status, v_uid
  ) returning id into v_id;
  if v_text_status = 'extrait' and coalesce(p_text, '') <> '' then
    insert into public.candidate_document_texts (document_id, candidate_id, method, content)
    values (v_id, v_candidate, 'pdf_text', left(p_text, 200000));
  end if;
  return v_id;
end $$;

-- Justificatif d'une certification : enregistré, rattaché, l'ancien retiré (une seule transaction)
create or replace function public.attach_certificate_document(
  p_certification uuid, p_storage_path text, p_filename text, p_mime text, p_size integer, p_sha256 text,
  p_scan_status text, p_scan_details text
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_candidate uuid := public.auth_candidate_id();
  v_old uuid;
  v_old_path text;
  v_id uuid;
  v_ext text := lower(substring(coalesce(p_storage_path, '') from '\.([a-z]+)$'));
begin
  if v_candidate is null then raise exception 'Action réservée aux candidats.' using errcode = '42501'; end if;
  select document_id into v_old from public.candidate_certifications where id = p_certification and candidate_id = v_candidate;
  if not found then raise exception 'Certification introuvable.'; end if;
  if p_storage_path is null or split_part(p_storage_path, '/', 1) <> v_uid::text or p_storage_path !~* '^[^/]+/[^/]+\.(pdf|jpe?g|png|webp)$'
     or p_mime not in ('application/pdf', 'image/jpeg', 'image/png', 'image/webp')
     or (p_mime = 'application/pdf' and v_ext <> 'pdf') or (p_mime = 'image/jpeg' and v_ext not in ('jpg', 'jpeg'))
     or (p_mime = 'image/png' and v_ext <> 'png') or (p_mime = 'image/webp' and v_ext <> 'webp') then
    raise exception 'Fichier ou chemin de stockage invalide.' using errcode = '42501';
  end if;
  insert into public.candidate_documents (
    candidate_id, kind, storage_path, original_filename, mime_type, size_bytes, sha256, version, is_current, scan_status, scan_details, uploaded_by
  ) values (
    v_candidate, 'certification', p_storage_path, left(coalesce(p_filename, 'certificat'), 255), p_mime, p_size, p_sha256, 1, true,
    case when p_scan_status = 'non_analyse' then 'non_analyse' else 'controle_basique_ok' end, left(p_scan_details, 2000), v_uid
  ) returning id into v_id;
  update public.candidate_certifications set document_id = v_id where id = p_certification;
  if v_old is not null then
    update public.candidate_documents set deleted_at = now(), is_current = false
     where id = v_old and deleted_at is null returning storage_path into v_old_path;
  end if;
  return jsonb_build_object('document_id', v_id, 'old_storage_path', v_old_path);
end $$;
revoke all on function public.attach_certificate_document(uuid, text, text, text, integer, text, text, text) from public, anon;
grant execute on function public.attach_certificate_document(uuid, text, text, text, integer, text, text, text) to authenticated, service_role;

-- Un CV signalé n'est jamais servi aux partenaires
create or replace function public.partner_cv_document(p_candidate uuid)
returns table (id uuid, storage_path text) language sql stable security definer set search_path = public as $$
  select d.id, d.storage_path from public.candidate_documents d
  where d.candidate_id = p_candidate and d.kind = 'cv' and d.is_current and d.deleted_at is null
    and d.scan_status not in ('suspect', 'rejete')
    and public.partner_can_view_cv(p_candidate)
$$;
create or replace function public.partner_can_read_cv_object(p_name text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.candidate_documents d
    where d.storage_path = p_name and d.kind = 'cv' and d.is_current and d.deleted_at is null
      and d.scan_status not in ('suspect', 'rejete')
      and public.partner_can_view_cv(d.candidate_id)
  )
$$;

-- -----------------------------------------------------------------------------
-- 5. Offres : un partenaire ne modifie plus une offre publiée (seule sa
--    clôture est possible) et ne touche jamais aux pondérations.
-- -----------------------------------------------------------------------------
create or replace function public.guard_offer_status()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_requires_validation boolean;
begin
  if auth.uid() is null or public.has_permission('offers.manage') then
    if new.status = 'publiee' and new.published_at is null then new.published_at := now(); end if;
    return new;
  end if;
  select coalesce((value)::text::boolean, true) into v_requires_validation
    from public.platform_settings where key = 'offers.partner_requires_validation';
  if coalesce(v_requires_validation, true) and new.status = 'publiee'
     and (tg_op = 'INSERT' or old.status is distinct from 'publiee') then
    raise exception 'Cette offre doit être validée par YEN avant publication' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' then
    if new.validated_by is distinct from old.validated_by or new.is_demo is distinct from old.is_demo
       or new.organization_id is distinct from old.organization_id or new.scoring_weights is distinct from old.scoring_weights then
      raise exception 'Modification non autorisée' using errcode = '42501';
    end if;
    if old.status not in ('brouillon', 'en_validation') then
      if (to_jsonb(new) - 'status' - 'updated_at') is distinct from (to_jsonb(old) - 'status' - 'updated_at')
         or (new.status is distinct from old.status and new.status not in ('pourvue', 'fermee')) then
        raise exception 'Une offre publiée ne peut plus être modifiée par le partenaire : contactez YEN.' using errcode = '42501';
      end if;
    end if;
  end if;
  if tg_op = 'INSERT' then new.validated_by := null; new.is_demo := false; new.created_by := auth.uid(); new.scoring_weights := null; end if;
  if new.status = 'publiee' and new.published_at is null then new.published_at := now(); end if;
  return new;
end $$;

-- -----------------------------------------------------------------------------
-- 6. Limitation de débit : seulement pour des clés propres à l'utilisateur
--    connecté (les connexions et inscriptions sont limitées par Supabase Auth).
-- -----------------------------------------------------------------------------
create or replace function public.rate_limit_hit(p_key text)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  v_prefix text := substring(coalesce(p_key, '') from '^([a-z-]+(?::[a-z]+)?):');
  v_max integer;
  v_window integer;
  v_count integer;
begin
  if auth.uid() is null or p_key is null or v_prefix is null then raise exception 'Clé de limitation invalide' using errcode = '42501'; end if;
  select r.max_hits, r.window_seconds into v_max, v_window
  from (values
    ('cv-upload', 10, 3600), ('certificate-upload', 20, 3600),
    ('ai:cv', 5, 3600), ('ai:profile', 5, 3600), ('ai:cvimp', 5, 3600), ('ai:plan', 5, 3600), ('ai:chat', 40, 3600)
  ) as r(prefix, max_hits, window_seconds)
  where r.prefix = v_prefix;
  if v_max is null then raise exception 'Clé de limitation inconnue'; end if;
  if p_key <> v_prefix || ':' || auth.uid()::text then raise exception 'Clé de limitation invalide' using errcode = '42501'; end if;
  if random() < 0.01 then
    delete from public.rate_limits where window_start < now() - interval '2 days';
  end if;
  insert into public.rate_limits as rl (key, count, window_start)
  values (p_key, 1, now())
  on conflict (key) do update
    set count = case when rl.window_start < now() - make_interval(secs => v_window) then 1 else rl.count + 1 end,
        window_start = case when rl.window_start < now() - make_interval(secs => v_window) then now() else rl.window_start end
  returning count into v_count;
  return v_count <= v_max;
end $$;
revoke all on function public.rate_limit_hit(text) from public, anon;
grant execute on function public.rate_limit_hit(text) to authenticated, service_role;

-- Journal applicatif : 200 entrées par heure et par utilisateur au plus
create or replace function public.log_audit(p_action text, p_entity_type text, p_entity_id text default null, p_details jsonb default '{}'::jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return; end if;
  if p_action !~ '^[a-z_]{3,64}$' or p_entity_type !~ '^[a-z_]{2,64}$' then
    raise exception 'Entrée de journal invalide';
  end if;
  if not public.check_rate_limit('audit:' || auth.uid()::text, 200, 3600) then return; end if;
  insert into public.audit_logs (actor_id, action, entity_type, entity_id, details)
  values (auth.uid(), p_action, p_entity_type, left(p_entity_id, 100),
          case when p_details is null or pg_column_size(p_details) > 8000 then '{}'::jsonb else p_details end);
end $$;

-- -----------------------------------------------------------------------------
-- 7. Coordonnées internes des organisations : jamais visibles des visiteurs ni
--    des candidats (ceux-ci passent par la vue offer_organizations).
-- -----------------------------------------------------------------------------
revoke select on public.organizations from anon;
grant select (id, name, sector, description, city, country, website, partnership_type, is_public, status, is_demo) on public.organizations to anon;
drop policy if exists organizations_select on public.organizations;
create policy organizations_select on public.organizations for select to authenticated
  using (public.is_staff()
         or exists (select 1 from public.partner_memberships m where m.organization_id = organizations.id and m.user_id = auth.uid()));

-- -----------------------------------------------------------------------------
-- 8. Étapes internes YEN : invisibles du candidat ET du partenaire ; la note
--    interne est portée par l'étape masquée, pas par la candidature.
-- -----------------------------------------------------------------------------
drop policy if exists app_events_select on public.application_events;
create policy app_events_select on public.application_events for select to authenticated
  using (exists (select 1 from public.applications a where a.id = application_id
                 and ((a.candidate_id = public.auth_candidate_id() and visible_to_candidate)
                      or public.has_permission('applications.manage') or public.has_permission('candidates.read')
                      or (visible_to_candidate and a.visible_to_partner
                          and exists (select 1 from public.job_offers o where o.id = a.offer_id and public.is_partner_member(o.organization_id))))));

drop function if exists public.hide_application_event(uuid, text);
create or replace function public.hide_application_event(p_application uuid, p_status text, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.has_permission('applications.manage') then
    raise exception 'Permission applications.manage requise' using errcode = '42501';
  end if;
  update public.application_events set visible_to_candidate = false, note = coalesce(left(p_note, 2000), note)
   where id = (select e.id from public.application_events e
               where e.application_id = p_application and e.to_status::text = p_status
               order by e.created_at desc limit 1);
end $$;
revoke all on function public.hide_application_event(uuid, text, text) from public, anon;
grant execute on function public.hide_application_event(uuid, text, text) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 9. Pipeline : un candidat ne le fait évoluer que par ses propres actions
--    (candidature envoyée ou retirée) ; un partenaire seulement sur les
--    candidatures qui lui sont transmises.
-- -----------------------------------------------------------------------------
create or replace function public.sync_application_pipeline(p_application uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  r record;
  v_next text;
  v_current text;
begin
  select a.candidate_id, a.status::text as status, a.visible_to_partner, o.offer_type::text as offer_type, o.organization_id into r
  from public.applications a join public.job_offers o on o.id = a.offer_id where a.id = p_application;
  if not found then return; end if;
  if not (
    public.has_permission('applications.manage')
    or (r.visible_to_partner and public.is_partner_member(r.organization_id))
    or (coalesce(r.candidate_id = public.auth_candidate_id(), false) and r.status in ('soumise', 'retiree'))
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

-- -----------------------------------------------------------------------------
-- 10. Liens web : http(s) uniquement, contrôlé aussi en base (nouvelles saisies)
-- -----------------------------------------------------------------------------
do $$
declare
  c record;
begin
  for c in select * from (values
    ('candidate_profiles', 'linkedin_url'), ('candidate_profiles', 'portfolio_url'), ('candidate_profiles', 'github_url'),
    ('candidate_certifications', 'credential_url'), ('candidate_projects', 'project_url'), ('candidate_projects', 'repository_url'),
    ('organizations', 'website')
  ) as t(tbl, col) loop
    execute format('alter table public.%I drop constraint if exists %I', c.tbl, c.tbl || '_' || c.col || '_http');
    execute format('alter table public.%I add constraint %I check (%I is null or %I ~* ''^https?://[^\s]+$'') not valid',
                   c.tbl, c.tbl || '_' || c.col || '_http', c.col, c.col);
  end loop;
end $$;

-- -----------------------------------------------------------------------------
-- 11. Consentements : non consultables sans connexion
-- -----------------------------------------------------------------------------
revoke execute on function public.has_consent(uuid, text) from public, anon;
grant execute on function public.has_consent(uuid, text) to authenticated, service_role;
