-- YEN Career Bridge — MISE À JOUR À COLLER DANS Supabase > SQL Editor > Run.
-- Contient les migrations 9 à 14 : certificats en image, téléphone obligatoire, fonctionnement
-- sans clé secrète, durcissement de sécurité (audit), surface d'exposition minimale et
-- certificats simplifiés (formation, organisme, période, justificatif).
-- Peut être exécuté plusieurs fois sans risque (même si une version précédente a déjà été exécutée).
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

-- =============================================================================
-- Migration 10 : numéro de téléphone obligatoire pour les candidats
-- Le formulaire d'inscription et le profil l'exigent déjà ; la base empêche en
-- plus un candidat d'effacer son numéro (même en appelant l'API directement).
-- =============================================================================

create or replace function public.protect_candidate_phone()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return new; end if; -- service / migrations / suppression de compte
  if new.account_type = 'candidate'
     and nullif(btrim(coalesce(old.phone, '')), '') is not null
     and nullif(btrim(coalesce(new.phone, '')), '') is null then
    raise exception 'Le numéro de téléphone est obligatoire.';
  end if;
  return new;
end $$;

drop trigger if exists profiles_candidate_phone on public.profiles;
create trigger profiles_candidate_phone before update of phone on public.profiles
  for each row execute function public.protect_candidate_phone();

update public.platform_settings set value = 'true'::jsonb where key = 'registration.phone_required';

-- =============================================================================
-- Migration 11 : fonctionnement sans clé de service
-- Les opérations qui exigeaient la clé « service_role » côté serveur passent par
-- des fonctions SQL SECURITY DEFINER qui vérifient elles-mêmes les droits de
-- l'appelant (auth.uid(), permissions). Aucune ne fait confiance à une valeur
-- calculée par le navigateur : notes, niveaux et statuts sont calculés en base.
-- Toutes les fonctions sont idempotentes (create or replace).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 0. Contexte de confiance
-- Exécute la suite de la transaction comme le « service » (les triggers de
-- protection laissent passer auth.uid() nul) en conservant l'auteur réel pour
-- le journal d'audit. Utilisable uniquement depuis les fonctions ci-dessous.
-- -----------------------------------------------------------------------------
create or replace function public._as_service(p_actor uuid)
returns void language plpgsql set search_path = public as $$
begin
  perform set_config('yen.actor', coalesce(p_actor::text, ''), true);
  perform set_config('request.jwt.claims', '', true);
  perform set_config('request.jwt.claim.sub', '', true);
end $$;
revoke all on function public._as_service(uuid) from public, anon, authenticated;

create or replace function public.audit_row_change()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_old jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) else null end;
  v_new jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) else null end;
  v_changes jsonb := '{}'::jsonb;
  k text;
  v_excluded text[] := array['updated_at', 'body', 'content', 'output', 'correction', 'motivation', 'match_snapshot'];
begin
  if tg_op = 'UPDATE' then
    for k in select jsonb_object_keys(v_new) loop
      if not (k = any(v_excluded)) and (v_new -> k) is distinct from (v_old -> k) then
        v_changes := v_changes || jsonb_build_object(k, jsonb_build_object('avant', v_old -> k, 'apres', v_new -> k));
      end if;
    end loop;
    if v_changes = '{}'::jsonb then return new; end if;
  elsif tg_op = 'INSERT' then
    v_changes := v_new - v_excluded;
  else
    v_changes := v_old - v_excluded;
  end if;

  insert into public.audit_logs (actor_id, action, entity_type, entity_id, details)
  values (coalesce(auth.uid(), nullif(current_setting('yen.actor', true), '')::uuid), lower(tg_op), tg_table_name,
          coalesce(v_new ->> 'id', v_old ->> 'id', v_new ->> 'user_id', v_old ->> 'user_id'), v_changes);
  return coalesce(new, old);
end $$;

create or replace function public.log_application_event()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_actor uuid := coalesce(auth.uid(), nullif(current_setting('yen.actor', true), '')::uuid);
begin
  if tg_op = 'INSERT' then
    insert into public.application_events (application_id, from_status, to_status, actor_id, note)
    values (new.id, null, new.status, v_actor, case when new.origin = 'yen' then 'Associé à l''offre par YEN' else 'Candidature envoyée' end);
  elsif new.status is distinct from old.status then
    insert into public.application_events (application_id, from_status, to_status, actor_id, note)
    values (new.id, old.status, new.status, v_actor, new.decision_reason);
  end if;
  return new;
end $$;

-- -----------------------------------------------------------------------------
-- 1. Limitation de débit : règles fixées en base (le client ne choisit ni le
--    plafond ni la fenêtre) ; les clés propres à un utilisateur doivent être
--    les siennes.
-- -----------------------------------------------------------------------------
create or replace function public.rate_limit_hit(p_key text)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  v_prefix text := substring(coalesce(p_key, '') from '^([a-z-]+(?::[a-z]+)?):');
  v_max integer;
  v_window integer;
  v_count integer;
begin
  if p_key is null or char_length(p_key) > 300 or v_prefix is null then
    raise exception 'Clé de limitation invalide';
  end if;
  select r.max_hits, r.window_seconds into v_max, v_window
  from (values
    ('login:ip', 30, 900), ('login:email', 8, 900), ('signup:ip', 10, 3600),
    ('reset:ip', 10, 3600), ('reset:email', 3, 3600),
    ('cv-upload', 10, 3600), ('certificate-upload', 20, 3600),
    ('ai:cv', 5, 3600), ('ai:profile', 5, 3600), ('ai:cvimp', 5, 3600), ('ai:plan', 5, 3600), ('ai:chat', 40, 3600)
  ) as r(prefix, max_hits, window_seconds)
  where r.prefix = v_prefix;
  if v_max is null then raise exception 'Clé de limitation inconnue'; end if;
  -- clés liées à un utilisateur : uniquement les siennes
  if v_prefix in ('cv-upload', 'certificate-upload') or v_prefix like 'ai:%' then
    if auth.uid() is null or p_key <> v_prefix || ':' || auth.uid()::text then
      raise exception 'Clé de limitation invalide' using errcode = '42501';
    end if;
  end if;
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
revoke all on function public.rate_limit_hit(text) from public;
grant execute on function public.rate_limit_hit(text) to anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 2. Journal d'audit : écrit au nom de l'utilisateur connecté (jamais d'un autre)
-- -----------------------------------------------------------------------------
create or replace function public.log_audit(p_action text, p_entity_type text, p_entity_id text default null, p_details jsonb default '{}'::jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return; end if;
  if p_action !~ '^[a-z_]{3,64}$' or p_entity_type !~ '^[a-z_]{2,64}$' then
    raise exception 'Entrée de journal invalide';
  end if;
  insert into public.audit_logs (actor_id, action, entity_type, entity_id, details)
  values (auth.uid(), p_action, p_entity_type, left(p_entity_id, 100),
          case when p_details is null or pg_column_size(p_details) > 8000 then '{}'::jsonb else p_details end);
end $$;
revoke all on function public.log_audit(text, text, text, jsonb) from public, anon;
grant execute on function public.log_audit(text, text, text, jsonb) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 3. Paramètres de la plateforme (aucun secret) : lisibles par les comptes
--    connectés ; la taille maximale d'un CV est publique (formulaires).
-- -----------------------------------------------------------------------------
drop policy if exists settings_select on public.platform_settings;
drop policy if exists settings_read_authenticated on public.platform_settings;
drop policy if exists settings_read_public on public.platform_settings;
create policy settings_read_authenticated on public.platform_settings for select to authenticated using (true);
create policy settings_read_public on public.platform_settings for select to anon
  using (key in ('documents.max_cv_size_mb', 'registration.phone_required'));
grant select on public.platform_settings to anon;

-- -----------------------------------------------------------------------------
-- 4. Notifications internes
-- -----------------------------------------------------------------------------
create or replace function public._notify(p_user uuid, p_category text, p_title text, p_body text, p_link text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_user is null then return; end if;
  insert into public.notifications (user_id, category, title, body, link)
  values (p_user, p_category, left(coalesce(p_title, ''), 200), left(coalesce(p_body, ''), 2000),
          case when p_link ~ '^/([^/\\]|$)' then left(p_link, 500) end);
end $$;
revoke all on function public._notify(uuid, text, text, text, text) from public, anon, authenticated;

create or replace function public._notify_permission(p_permission text, p_category text, p_title text, p_body text, p_link text)
returns void language plpgsql security definer set search_path = public as $$
declare
  r record;
begin
  for r in
    select distinct ur.user_id
    from public.user_roles ur
    join public.role_permissions rp on rp.role = ur.role and rp.permission_code = p_permission
    join public.profiles p on p.id = ur.user_id and p.is_active
  loop
    perform public._notify(r.user_id, p_category, p_title, p_body, p_link);
  end loop;
end $$;
revoke all on function public._notify_permission(text, text, text, text, text) from public, anon, authenticated;

-- Personnel YEN → n'importe quel utilisateur
create or replace function public.notify_user(p_user uuid, p_category text, p_title text, p_body text default '', p_link text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_staff() then raise exception 'Action non autorisée' using errcode = '42501'; end if;
  perform public._notify(p_user, p_category, p_title, p_body, p_link);
end $$;

-- Candidat : par le personnel, par lui-même, ou par une organisation qui suit sa candidature
create or replace function public.notify_candidate(p_candidate uuid, p_category text, p_title text, p_body text default '', p_link text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not (
    public.is_staff()
    or coalesce(p_candidate = public.auth_candidate_id(), false)
    or exists (
      select 1 from public.applications a join public.job_offers o on o.id = a.offer_id
      where a.candidate_id = p_candidate and a.visible_to_partner and public.is_partner_member(o.organization_id)
    )
  ) then
    raise exception 'Action non autorisée' using errcode = '42501';
  end if;
  perform public._notify((select user_id from public.candidate_profiles where id = p_candidate), p_category, p_title, p_body, p_link);
end $$;

-- Organisation : par le personnel, ses membres, ou un candidat ayant postulé à l'une de ses offres
create or replace function public.notify_organization(p_organization uuid, p_category text, p_title text, p_body text default '', p_link text default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  r record;
begin
  if not (
    public.is_staff()
    or public.is_partner_member(p_organization)
    or exists (
      select 1 from public.applications a join public.job_offers o on o.id = a.offer_id
      where o.organization_id = p_organization and a.candidate_id = public.auth_candidate_id()
    )
  ) then
    raise exception 'Action non autorisée' using errcode = '42501';
  end if;
  for r in select m.user_id from public.partner_memberships m where m.organization_id = p_organization and m.status = 'actif' loop
    perform public._notify(r.user_id, p_category, p_title, p_body, p_link);
  end loop;
end $$;

-- Personnel détenant une permission : par tout utilisateur connecté (60 par heure au plus)
create or replace function public.notify_staff(p_permission text, p_category text, p_title text, p_body text default '', p_link text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Action non autorisée' using errcode = '42501'; end if;
  if not public.check_rate_limit('notify-staff:' || auth.uid()::text, 60, 3600) then return; end if;
  perform public._notify_permission(p_permission, p_category, p_title, p_body, p_link);
end $$;

-- Candidats d'un domaine (nouvelle évaluation ou nouvelle offre) : personnel habilité
create or replace function public.notify_candidates_by_domain(p_domain uuid, p_offer_type text, p_category text, p_title text, p_body text default '', p_link text default null)
returns integer language plpgsql security definer set search_path = public as $$
declare
  r record;
  n integer := 0;
begin
  if not (public.has_permission('offers.manage') or public.has_permission('assessments.manage')) then
    raise exception 'Action non autorisée' using errcode = '42501';
  end if;
  for r in
    select c.user_id from public.candidate_profiles c
    where c.primary_domain_id = p_domain
      and (p_offer_type is null or p_offer_type::public.opportunity_type = any(c.opportunity_types))
    limit 500
  loop
    perform public._notify(r.user_id, p_category, p_title, p_body, p_link);
    n := n + 1;
  end loop;
  return n;
end $$;

revoke all on function public.notify_user(uuid, text, text, text, text) from public, anon;
revoke all on function public.notify_candidate(uuid, text, text, text, text) from public, anon;
revoke all on function public.notify_organization(uuid, text, text, text, text) from public, anon;
revoke all on function public.notify_staff(text, text, text, text, text) from public, anon;
revoke all on function public.notify_candidates_by_domain(uuid, text, text, text, text, text) from public, anon;
grant execute on function public.notify_user(uuid, text, text, text, text) to authenticated, service_role;
grant execute on function public.notify_candidate(uuid, text, text, text, text) to authenticated, service_role;
grant execute on function public.notify_organization(uuid, text, text, text, text) to authenticated, service_role;
grant execute on function public.notify_staff(text, text, text, text, text) to authenticated, service_role;
grant execute on function public.notify_candidates_by_domain(uuid, text, text, text, text, text) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 5. Évaluations : distribution des questions SANS clés, correction en base
-- -----------------------------------------------------------------------------
create or replace function public._normalize_answer(p text)
returns text language sql immutable set search_path = public as $$
  select btrim(regexp_replace(
           regexp_replace(
             regexp_replace(
               lower(translate(coalesce(p, ''),
                 'ÀÁÂÃÄÅàáâãäåÇçÈÉÊËèéêëÌÍÎÏìíîïÑñÒÓÔÕÖòóôõöÙÚÛÜùúûüÝýÿ',
                 'AAAAAAaaaaaaCcEEEEeeeeIIIIiiiiNnOOOOOoooooUUUUuuuuYyy')),
               '[`"''«»]', '', 'g'),
             '\s*[.,;:!?]\s*$', ''),
           '\s+', ' ', 'g'))
$$;

-- Démarre (ou reprend) une tentative : disponibilité, nombre maximal et délai entre tentatives
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

  select t.id into v_open from public.assessment_attempts t
  where t.assessment_id = a.id and t.candidate_id = v_candidate and t.status = 'en_cours'
    and t.deadline_at + interval '5 minutes' > now()
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

-- Questions d'une tentative en cours, sans bonnes réponses ni explications
create or replace function public.get_attempt_questions(p_attempt uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  t record;
begin
  select at.id, at.assessment_id, at.status into t from public.assessment_attempts at
  where at.id = p_attempt and at.candidate_id = public.auth_candidate_id();
  if not found then raise exception 'Tentative introuvable.' using errcode = '42501'; end if;
  if t.status <> 'en_cours' then raise exception 'Cette tentative n''est plus en cours.'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', q.id, 'position', q.position, 'type', q.question_type, 'prompt', q.prompt, 'points', q.points, 'rubric', q.rubric,
      'options', coalesce((select jsonb_agg(jsonb_build_object('id', o.id, 'label', o.label) order by o.position)
                           from public.assessment_options o where o.question_id = q.id), '[]'::jsonb)
    ) order by q.position)
    from public.assessment_questions q where q.assessment_id = t.assessment_id
  ), '[]'::jsonb);
end $$;

-- Points de chaque question d'une tentative (mêmes règles que src/features/assessments/grading.ts)
create or replace function public._grade_attempt(p_attempt uuid)
returns table (question_id uuid, skill_id uuid, max_points numeric, points numeric, needs_review boolean, ord integer)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
declare
  q record;
  a record;
  v_has boolean;
  v_valid uuid[];
  v_sel uuid[];
  v_correct uuid[];
  v_first_correct uuid;
  v_points numeric;
  v_review boolean;
  v_given text;
  v_ord integer := 0;
begin
  for q in
    select qq.id, qq.question_type::text as qtype, qq.points, qq.skill_id, qq.accepted_answers
    from public.assessment_questions qq
    join public.assessment_attempts t on t.assessment_id = qq.assessment_id
    where t.id = p_attempt
    order by qq.position, qq.id
  loop
    v_ord := v_ord + 1;
    select aa.selected_option_ids, aa.text_answer, aa.manual_points into a
    from public.assessment_answers aa where aa.attempt_id = p_attempt and aa.question_id = q.id;
    v_has := found;
    v_review := false;
    if q.qtype in ('reponse_longue', 'etude_de_cas', 'exercice_pratique') then
      -- correction humaine ; une réponse vide vaut 0 sans relecture
      if not v_has or coalesce(btrim(a.text_answer), '') = '' then v_points := 0; else v_points := null; v_review := true; end if;
    elsif not v_has then
      v_points := 0;
    else
      select coalesce(array_agg(o.id), '{}') into v_valid from public.assessment_options o where o.question_id = q.id;
      select coalesce(array_agg(distinct s), '{}') into v_sel from unnest(coalesce(a.selected_option_ids, '{}'::uuid[])) s where s = any(v_valid);
      if q.qtype = 'choix_unique' then
        select o.id into v_first_correct from public.assessment_options o where o.question_id = q.id and o.is_correct order by o.position, o.id limit 1;
        v_points := case when cardinality(v_sel) = 1 and v_first_correct is not null and v_sel[1] = v_first_correct then q.points else 0 end;
      elsif q.qtype = 'choix_multiple' then
        select coalesce(array_agg(o.id), '{}') into v_correct from public.assessment_options o where o.question_id = q.id and o.is_correct;
        if cardinality(v_correct) = 0 then
          v_points := null; v_review := true;
        elsif cardinality(v_sel) = 0 or exists (select 1 from unnest(v_sel) s where not (s = any(v_correct))) then
          v_points := 0;
        else
          v_points := round(q.points * cardinality(v_sel)::numeric / cardinality(v_correct), 2);
        end if;
      elsif q.qtype = 'reponse_courte' then
        if cardinality(q.accepted_answers) = 0 then
          if coalesce(btrim(a.text_answer), '') = '' then v_points := 0; else v_points := null; v_review := true; end if;
        else
          v_given := public._normalize_answer(a.text_answer);
          v_points := case when v_given <> '' and exists (
            select 1 from unnest(q.accepted_answers) acc where public._normalize_answer(acc) = v_given
          ) then q.points else 0 end;
        end if;
      else
        v_points := null; v_review := true;
      end if;
    end if;
    -- note de l'évaluateur (prioritaire, bornée au barème)
    if v_has and a.manual_points is not null then
      v_points := greatest(0, least(q.points, a.manual_points));
      v_review := false;
    end if;
    question_id := q.id; skill_id := q.skill_id; max_points := q.points; points := v_points; needs_review := v_review; ord := v_ord;
    return next;
  end loop;
end $$;
revoke all on function public._grade_attempt(uuid) from public, anon, authenticated;

-- Finalise une tentative entièrement corrigée : score, réussite, détail par
-- compétence, recommandations, preuves de compétences et notification.
create or replace function public._finalize_attempt(p_attempt uuid, p_reviewer uuid, p_comment text)
returns void language plpgsql security definer set search_path = public as $$
declare
  t record;
  v_levels text[] := array['debutant', 'intermediaire', 'avance', 'expert'];
  v_needs boolean;
  v_max numeric;
  v_earned numeric;
  v_score numeric;
  v_passing numeric;
  v_auto_max text;
  v_cap text;
  v_source text;
  v_human boolean := p_reviewer is not null;
  v_by_skill jsonb;
  v_recs jsonb;
begin
  select at.id, at.candidate_id, a.title, a.level::text as level, a.passing_score, a.assessment_type into t
  from public.assessment_attempts at join public.assessments a on a.id = at.assessment_id
  where at.id = p_attempt;
  if not found then raise exception 'Tentative introuvable.'; end if;

  select coalesce(bool_or(g.needs_review), false), round(coalesce(sum(g.max_points), 0), 2), round(coalesce(sum(coalesce(g.points, 0)), 0), 2)
    into v_needs, v_max, v_earned
  from public._grade_attempt(p_attempt) g;
  if v_needs or v_max = 0 then raise exception 'Correction incomplète'; end if;
  v_score := round(100 * v_earned / v_max, 2);
  v_passing := t.passing_score;

  update public.assessment_answers aa
     set final_points = g.points,
         auto_points = case when aa.manual_points is null then g.points else aa.auto_points end
    from public._grade_attempt(p_attempt) g
   where aa.attempt_id = p_attempt and aa.question_id = g.question_id;

  select coalesce(jsonb_agg(jsonb_build_object(
           'skillId', x.skill_id, 'name', sk.name, 'earned', trim_scale(x.earned), 'max', trim_scale(x.max_pts),
           'percent', trim_scale(x.percent), 'questionCount', x.qc
         ) order by x.first_ord), '[]'::jsonb)
    into v_by_skill
  from (
    select g.skill_id,
           round(sum(coalesce(g.points, 0)), 2) as earned,
           round(sum(g.max_points), 2) as max_pts,
           case when sum(g.max_points) > 0 then round(100 * sum(coalesce(g.points, 0)) / sum(g.max_points), 2) else 0 end as percent,
           count(*)::integer as qc,
           min(g.ord) as first_ord
    from public._grade_attempt(p_attempt) g
    where g.skill_id is not null
    group by g.skill_id
  ) x
  left join public.skills sk on sk.id = x.skill_id;

  select coalesce(jsonb_agg(jsonb_build_object(
           'skillId', e ->> 'skillId',
           'title', 'Renforcer : ' || coalesce(e ->> 'name', 'compétence'),
           'body', format('Résultat de %s %% sur %s question(s) (seuil %s %%). Revoyez les explications des questions manquées, puis réalisez un petit projet pratique mobilisant cette compétence avant de repasser l''évaluation.',
                          round((e ->> 'percent')::numeric), e ->> 'questionCount', trim_scale(v_passing))
         ) order by (e ->> 'percent')::numeric), '[]'::jsonb)
    into v_recs
  from jsonb_array_elements(v_by_skill) e
  where (e ->> 'percent')::numeric < v_passing;

  select value #>> '{}' into v_auto_max from public.platform_settings where key = 'assessments.auto_max_level';
  v_cap := case when v_human then 'expert'
                when v_auto_max in ('debutant', 'intermediaire', 'avance') then v_auto_max
                else 'avance' end;
  v_source := case when t.assessment_type in ('exercice_pratique', 'etude_de_cas') then 'exercice' else 'questionnaire' end;

  update public.assessment_attempts set
    status = 'corrige',
    graded_at = now(),
    max_points = v_max,
    earned_points = v_earned,
    score_percent = v_score,
    passed = v_score >= v_passing,
    needs_human_review = false,
    reviewed_by = p_reviewer,
    reviewer_comment = p_comment,
    result_details = jsonb_build_object('bySkill', v_by_skill),
    recommendations = v_recs
  where id = p_attempt;

  -- Preuves : niveau de l'évaluation, plafonné ; jamais « expert » sans évaluateur
  insert into public.skill_assessments (candidate_id, skill_id, level, score_percent, source, attempt_id, assessed_by, confidence, status, notes)
  select t.candidate_id, (e ->> 'skillId')::uuid, l.lvl::public.skill_level, (e ->> 'percent')::numeric,
         case when l.lvl = 'expert' then 'evaluateur' else v_source end,
         p_attempt, p_reviewer,
         case when v_human then case when (e ->> 'questionCount')::integer >= 2 then 'elevee' else 'moyenne' end
              else case when (e ->> 'questionCount')::integer >= 3 then 'moyenne' else 'faible' end end,
         'valide',
         format('%s : %s/%s point(s) sur %s question(s).', t.title, e ->> 'earned', e ->> 'max', e ->> 'questionCount')
  from jsonb_array_elements(v_by_skill) e
  cross join lateral (
    select case when (e ->> 'percent')::numeric < v_passing then null
                when array_position(v_levels, t.level) <= array_position(v_levels, v_cap) then t.level
                else v_cap end as lvl
  ) l
  where l.lvl is not null;

  insert into public.ai_recommendations (candidate_id, rec_type, title, body, skill_id, origin, source_refs)
  select t.candidate_id, 'competence', r ->> 'title', r ->> 'body', (r ->> 'skillId')::uuid, 'regles', jsonb_build_array('attempt:' || p_attempt::text)
  from jsonb_array_elements(v_recs) r;

  perform public._notify(
    (select user_id from public.candidate_profiles where id = t.candidate_id),
    'evaluation',
    'Résultat disponible : ' || t.title,
    format('Score : %s %%%s.', round(v_score), case when v_score >= v_passing then ' — réussi' else '' end),
    '/candidat/evaluations/tentative/' || p_attempt::text
  );
end $$;
revoke all on function public._finalize_attempt(uuid, uuid, text) from public, anon, authenticated;

-- Soumission par le candidat : enregistrement, correction automatique, et
-- passage en correction humaine pour les réponses libres.
-- Retour : 'corrige', 'en_correction' ou 'expire'.
create or replace function public.submit_assessment_attempt(p_attempt uuid, p_answers jsonb)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_candidate uuid := public.auth_candidate_id();
  v_answers jsonb := coalesce(p_answers, '[]'::jsonb);
  t record;
  v_needs boolean;
  v_max numeric;
begin
  if v_candidate is null then raise exception 'Action réservée aux candidats.' using errcode = '42501'; end if;
  if jsonb_typeof(v_answers) <> 'array' or jsonb_array_length(v_answers) > 200 then raise exception 'Réponses invalides.'; end if;
  select at.id, at.assessment_id, at.status, at.deadline_at, a.title into t
  from public.assessment_attempts at join public.assessments a on a.id = at.assessment_id
  where at.id = p_attempt and at.candidate_id = v_candidate
  for update of at;
  if not found then raise exception 'Tentative introuvable.'; end if;
  if t.status <> 'en_cours' then raise exception 'Cette tentative a déjà été soumise.'; end if;
  if t.deadline_at + interval '5 minutes' < now() then
    update public.assessment_attempts set status = 'expire', submitted_at = now() where id = t.id;
    return 'expire';
  end if;

  -- une ligne par question de l'évaluation (réponses inconnues ignorées)
  insert into public.assessment_answers (attempt_id, question_id, selected_option_ids, text_answer)
  select t.id, q.id, coalesce(sel.ids, '{}'::uuid[]), nullif(left(btrim(coalesce(ans.val ->> 'textAnswer', '')), 10000), '')
  from public.assessment_questions q
  left join lateral (
    select x.value as val from jsonb_array_elements(v_answers) x
    where jsonb_typeof(x.value) = 'object' and x.value ->> 'questionId' = q.id::text
    limit 1
  ) ans on true
  left join lateral (
    select array_agg(distinct o.id) as ids from public.assessment_options o
    where o.question_id = q.id and ans.val is not null
      and o.id::text in (
        select jsonb_array_elements_text(case when jsonb_typeof(ans.val -> 'selectedOptionIds') = 'array' then ans.val -> 'selectedOptionIds' else '[]'::jsonb end)
      )
  ) sel on true
  where q.assessment_id = t.assessment_id
  on conflict (attempt_id, question_id) do update
    set selected_option_ids = excluded.selected_option_ids, text_answer = excluded.text_answer;

  update public.assessment_answers aa set auto_points = g.points
  from public._grade_attempt(t.id) g
  where aa.attempt_id = t.id and aa.question_id = g.question_id;

  select coalesce(bool_or(g.needs_review), false), round(coalesce(sum(g.max_points), 0), 2) into v_needs, v_max
  from public._grade_attempt(t.id) g;
  if v_max = 0 then raise exception 'Cette évaluation ne contient aucune question.'; end if;

  update public.assessment_attempts
     set status = case when v_needs then 'en_correction' else 'en_cours' end,
         submitted_at = now(), needs_human_review = v_needs, max_points = v_max
   where id = t.id;

  if v_needs then
    perform public._notify_permission('assessments.review', 'evaluation', 'Nouvelle correction à effectuer',
      format('Une tentative de « %s » attend une correction humaine.', t.title), '/admin/corrections/' || t.id::text);
    return 'en_correction';
  end if;
  perform public._finalize_attempt(t.id, null, null);
  return 'corrige';
end $$;

-- Validation d'une correction humaine par un évaluateur (après saisie des notes)
create or replace function public.finalize_assessment_review(p_attempt uuid, p_comment text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.has_permission('assessments.review') then
    raise exception 'Permission assessments.review requise' using errcode = '42501';
  end if;
  if not exists (select 1 from public.assessment_attempts where id = p_attempt and status = 'en_correction') then
    raise exception 'Cette tentative n''est pas en attente de correction.';
  end if;
  perform public._finalize_attempt(p_attempt, auth.uid(), left(p_comment, 3000));
end $$;

-- Corrigé d'une tentative terminée, pour son candidat
create or replace function public.get_attempt_review(p_attempt uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'prompt', q.prompt, 'points', aa.final_points, 'max', q.points, 'explanation', q.explanation,
           'comment', aa.reviewer_comment, 'position', q.position
         ) order by q.position), '[]'::jsonb)
  from public.assessment_answers aa
  join public.assessment_questions q on q.id = aa.question_id
  where aa.attempt_id = p_attempt
    and exists (select 1 from public.assessment_attempts t
                where t.id = p_attempt and t.candidate_id = public.auth_candidate_id() and t.status = 'corrige')
$$;

revoke all on function public.start_assessment_attempt(uuid) from public, anon;
revoke all on function public.get_attempt_questions(uuid) from public, anon;
revoke all on function public.submit_assessment_attempt(uuid, jsonb) from public, anon;
revoke all on function public.finalize_assessment_review(uuid, text) from public, anon;
revoke all on function public.get_attempt_review(uuid) from public, anon;
grant execute on function public.start_assessment_attempt(uuid) to authenticated, service_role;
grant execute on function public.get_attempt_questions(uuid) to authenticated, service_role;
grant execute on function public.submit_assessment_attempt(uuid, jsonb) to authenticated, service_role;
grant execute on function public.finalize_assessment_review(uuid, text) to authenticated, service_role;
grant execute on function public.get_attempt_review(uuid) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 6. Documents du candidat (CV, justificatifs)
-- -----------------------------------------------------------------------------
-- Enregistre un CV déjà déposé dans le dossier de stockage du candidat ; il
-- devient la version courante (numéro de version calculé en base).
create or replace function public.register_cv_document(
  p_storage_path text, p_filename text, p_size integer, p_sha256 text, p_scan_status text, p_scan_details text,
  p_page_count integer, p_text_status text, p_text text default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_candidate uuid := public.auth_candidate_id();
  v_version integer;
  v_id uuid;
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
    p_scan_status, left(p_scan_details, 2000), p_page_count, p_text_status, v_uid
  ) returning id into v_id;
  if p_text_status = 'extrait' and coalesce(p_text, '') <> '' then
    insert into public.candidate_document_texts (document_id, candidate_id, method, content)
    values (v_id, v_candidate, 'pdf_text', left(p_text, 200000));
  end if;
  return v_id;
end $$;

-- Suppression logique d'un document du candidat ; renvoie le chemin du fichier à effacer
create or replace function public.retire_candidate_document(p_document uuid)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_path text;
begin
  update public.candidate_documents set deleted_at = now(), is_current = false
   where id = p_document and candidate_id = public.auth_candidate_id() and deleted_at is null
   returning storage_path into v_path;
  if v_path is null then raise exception 'Document introuvable.'; end if;
  delete from public.candidate_document_texts where document_id = p_document;
  return v_path;
end $$;

-- Rétablit une ancienne version du CV comme version courante
create or replace function public.set_current_cv(p_document uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_candidate uuid := public.auth_candidate_id();
begin
  if not exists (select 1 from public.candidate_documents
                 where id = p_document and candidate_id = v_candidate and kind = 'cv' and deleted_at is null) then
    raise exception 'Document introuvable.';
  end if;
  update public.candidate_documents set is_current = false where candidate_id = v_candidate and kind = 'cv' and is_current;
  update public.candidate_documents set is_current = true where id = p_document;
end $$;

revoke all on function public.register_cv_document(text, text, integer, text, text, text, integer, text, text) from public, anon;
revoke all on function public.retire_candidate_document(uuid) from public, anon;
revoke all on function public.set_current_cv(uuid) from public, anon;
grant execute on function public.register_cv_document(text, text, integer, text, text, text, integer, text, text) to authenticated, service_role;
grant execute on function public.retire_candidate_document(uuid) to authenticated, service_role;
grant execute on function public.set_current_cv(uuid) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 7. Pipeline du candidat
-- -----------------------------------------------------------------------------
-- Étapes automatiques (profil incomplet ↔ en évaluation) ; les suivantes restent des décisions YEN.
create or replace function public.set_auto_pipeline_status(p_candidate uuid, p_status text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not (coalesce(p_candidate = public.auth_candidate_id(), false) or public.is_staff()) then
    raise exception 'Action non autorisée' using errcode = '42501';
  end if;
  if p_status not in ('profil_incomplet', 'en_evaluation') then raise exception 'Statut automatique invalide'; end if;
  perform public._as_service(auth.uid());
  update public.candidate_profiles set pipeline_status = p_status::public.pipeline_status
   where id = p_candidate and pipeline_status in ('profil_incomplet', 'en_evaluation')
     and pipeline_status <> p_status::public.pipeline_status;
end $$;

-- Reflète l'état d'une candidature dans le pipeline (sans rétrograder un candidat placé)
create or replace function public.sync_application_pipeline(p_application uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  r record;
  v_next text;
  v_current text;
begin
  select a.candidate_id, a.status::text as status, o.offer_type::text as offer_type, o.organization_id into r
  from public.applications a join public.job_offers o on o.id = a.offer_id where a.id = p_application;
  if not found then return; end if;
  if not (coalesce(r.candidate_id = public.auth_candidate_id(), false) or public.has_permission('applications.manage') or public.is_partner_member(r.organization_id)) then
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

-- Placement confirmé : stage ou emploi obtenu
create or replace function public.confirm_placement_pipeline(p_candidate uuid, p_placement_type text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.has_permission('placements.manage') then
    raise exception 'Permission placements.manage requise' using errcode = '42501';
  end if;
  perform public._as_service(auth.uid());
  update public.candidate_profiles
     set pipeline_status = case when p_placement_type = 'stage' then 'stage_obtenu' else 'emploi_obtenu' end::public.pipeline_status
   where id = p_candidate;
end $$;

revoke all on function public.set_auto_pipeline_status(uuid, text) from public, anon;
revoke all on function public.sync_application_pipeline(uuid) from public, anon;
revoke all on function public.confirm_placement_pipeline(uuid, text) from public, anon;
grant execute on function public.set_auto_pipeline_status(uuid, text) to authenticated, service_role;
grant execute on function public.sync_application_pipeline(uuid) to authenticated, service_role;
grant execute on function public.confirm_placement_pipeline(uuid, text) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 8. Candidatures
-- -----------------------------------------------------------------------------
-- Masque au candidat la dernière étape d'un statut donné (revue interne YEN)
create or replace function public.hide_application_event(p_application uuid, p_status text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.has_permission('applications.manage') then
    raise exception 'Permission applications.manage requise' using errcode = '42501';
  end if;
  update public.application_events set visible_to_candidate = false
   where id = (select e.id from public.application_events e
               where e.application_id = p_application and e.to_status::text = p_status
               order by e.created_at desc limit 1);
end $$;

-- Retour d'un partenaire sur des compétences : preuves « en attente » de validation par YEN
create or replace function public.add_partner_skill_feedback(p_application uuid, p_context text, p_ratings jsonb)
returns integer language plpgsql security definer set search_path = public as $$
declare
  v_candidate uuid;
  n integer;
begin
  select a.candidate_id into v_candidate
  from public.applications a join public.job_offers o on o.id = a.offer_id
  where a.id = p_application and a.visible_to_partner and public.is_partner_member(o.organization_id);
  if v_candidate is null then raise exception 'Action non autorisée' using errcode = '42501'; end if;
  if jsonb_typeof(coalesce(p_ratings, '[]'::jsonb)) <> 'array' or jsonb_array_length(coalesce(p_ratings, '[]'::jsonb)) > 30 then
    raise exception 'Évaluations invalides.';
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

revoke all on function public.hide_application_event(uuid, text) from public, anon;
revoke all on function public.add_partner_skill_feedback(uuid, text, jsonb) from public, anon;
grant execute on function public.hide_application_event(uuid, text) to authenticated, service_role;
grant execute on function public.add_partner_skill_feedback(uuid, text, jsonb) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 9. Vue restreinte pour les partenaires
-- Uniquement des informations professionnelles : jamais l'e-mail, le téléphone,
-- les notes internes, les analyses IA ni le suivi YEN.
-- -----------------------------------------------------------------------------
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
      from public.skill_assessments s join public.skills sk on sk.id = s.skill_id where s.candidate_id = p_candidate), '[]'::jsonb),
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

-- Identifiants publics YEN des candidats visibles par l'organisation du partenaire
create or replace function public.partner_candidate_codes(p_ids uuid[])
returns table (id uuid, public_code text) language sql stable security definer set search_path = public as $$
  select cp.id, cp.public_code from public.candidate_profiles cp
  where cp.id = any(coalesce(p_ids, '{}'::uuid[])) and public.partner_can_view_candidate(cp.id)
$$;

-- Fichier du CV courant d'un candidat, si le partenaire peut le télécharger
create or replace function public.partner_cv_document(p_candidate uuid)
returns table (id uuid, storage_path text) language sql stable security definer set search_path = public as $$
  select d.id, d.storage_path from public.candidate_documents d
  where d.candidate_id = p_candidate and d.kind = 'cv' and d.is_current and d.deleted_at is null
    and public.partner_can_view_cv(p_candidate)
$$;

-- Le stockage autorise la lecture du CV courant par un partenaire habilité
create or replace function public.partner_can_read_cv_object(p_name text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.candidate_documents d
    where d.storage_path = p_name and d.kind = 'cv' and d.is_current and d.deleted_at is null
      and public.partner_can_view_cv(d.candidate_id)
  )
$$;

drop policy if exists "candidate_documents_partner_cv_read" on storage.objects;
create policy "candidate_documents_partner_cv_read" on storage.objects for select to authenticated
  using (bucket_id = 'candidate-documents' and public.partner_can_read_cv_object(name));

revoke all on function public.partner_candidate_data(uuid) from public, anon;
revoke all on function public.partner_candidate_codes(uuid[]) from public, anon;
revoke all on function public.partner_cv_document(uuid) from public, anon;
revoke all on function public.partner_can_read_cv_object(text) from public, anon;
grant execute on function public.partner_candidate_data(uuid) to authenticated, service_role;
grant execute on function public.partner_candidate_codes(uuid[]) to authenticated, service_role;
grant execute on function public.partner_cv_document(uuid) to authenticated, service_role;
grant execute on function public.partner_can_read_cv_object(text) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 10. Administration
-- -----------------------------------------------------------------------------
-- Rôle « partner » aligné sur les adhésions actives (validation d'un recruteur)
create or replace function public.sync_partner_role(p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_actor uuid := auth.uid();
begin
  if not public.has_permission('partners.manage') then
    raise exception 'Permission partners.manage requise' using errcode = '42501';
  end if;
  perform public._as_service(v_actor);
  if exists (select 1 from public.partner_memberships where user_id = p_user and status = 'actif') then
    insert into public.user_roles (user_id, role, granted_by) values (p_user, 'partner', v_actor) on conflict do nothing;
  else
    delete from public.user_roles where user_id = p_user and role = 'partner';
  end if;
end $$;
revoke all on function public.sync_partner_role(uuid) from public, anon;
grant execute on function public.sync_partner_role(uuid) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 11. Candidature déposée par le candidat : l'instantané de compatibilité est
--     toujours calculé par YEN (jamais fourni par le candidat).
-- -----------------------------------------------------------------------------
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
    if new.status not in ('proposee_partenaire', 'entretien_programme', 'attente_decision', 'acceptee', 'refusee') then
      raise exception 'Statut non autorisé pour un partenaire' using errcode = '42501';
    end if;
    if new.status in ('acceptee', 'refusee') and new.status is distinct from old.status then
      new.decided_by := auth.uid(); new.decided_at := now();
    end if;
    return new;
  end if;

  raise exception 'Action non autorisée' using errcode = '42501';
end $$;

-- -----------------------------------------------------------------------------
-- 12. Pages publiques : les métadonnées des évaluations publiées (titre, niveau,
--     durée, description) sont lisibles sans connexion. Les questions et les
--     clés de correction restent inaccessibles.
-- -----------------------------------------------------------------------------
drop policy if exists assessments_public_read on public.assessments;
create policy assessments_public_read on public.assessments for select to anon using (status = 'publie');
grant select on public.assessments to anon;

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
