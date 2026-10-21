-- =============================================================================
-- Migration 15 : sécurité des fonctions d'IA (audit IA d'octobre 2026)
--  - Les propositions de note de l'IA (avant validation par l'évaluateur) ne sont plus
--    lisibles par le candidat : ni la note proposée, ni le commentaire, ni l'analyse.
--  - Le personnel lit ces propositions par une fonction réservée aux correcteurs.
--  - Le résultat enregistré d'une analyse IA ne peut plus être réécrit : seule la revue
--    humaine (statut, correction, motif) est modifiable, au nom de son auteur.
--  - Plafond horaire des analyses IA lancées par le personnel (ai:staff, 60 par heure).
-- =============================================================================

-- 1. Analyses : le candidat ne voit ni les synthèses internes ni les aides à la correction
drop policy if exists ai_analyses_select on public.ai_analyses;
create policy ai_analyses_select on public.ai_analyses for select to authenticated
  using ((candidate_id = public.auth_candidate_id() and kind not in ('synthese_responsable', 'resume_rapprochement', 'correction_reponse'))
         or public.has_permission('candidates.read'));

-- 2. Réponses aux évaluations : toutes les colonnes sauf la proposition de l'IA
revoke select on public.assessment_answers from authenticated;
grant select (id, attempt_id, question_id, selected_option_ids, text_answer, auto_points, manual_points, final_points, reviewer_comment, graded_by, created_at)
  on public.assessment_answers to authenticated;

create or replace function public.ai_grading_suggestions(p_attempt_id uuid)
returns table (answer_id uuid, suggested_points numeric, feedback text)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.has_permission('assessments.review') then
    raise exception 'Accès refusé' using errcode = '42501';
  end if;
  return query
    select aa.id, aa.ai_suggested_points::numeric, aa.ai_feedback
    from public.assessment_answers aa
    where aa.attempt_id = p_attempt_id and aa.ai_suggested_points is not null;
end $$;
revoke all on function public.ai_grading_suggestions(uuid) from public, anon;
grant execute on function public.ai_grading_suggestions(uuid) to authenticated, service_role;

-- 3. Analyses IA : résultat, sources, modèle et auteur immuables (seule la revue évolue)
create or replace function public.protect_ai_analysis_columns()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return new; end if; -- serveur (clé de service) et migrations
  if (to_jsonb(new) - array['validation_status', 'correction', 'correction_note', 'validated_by', 'validated_at'])
     is distinct from (to_jsonb(old) - array['validation_status', 'correction', 'correction_note', 'validated_by', 'validated_at']) then
    raise exception 'Le résultat d''une analyse IA ne peut pas être modifié : utilisez la correction' using errcode = '42501';
  end if;
  if new.validation_status is distinct from old.validation_status
     or new.correction is distinct from old.correction
     or new.correction_note is distinct from old.correction_note then
    new.validated_by := auth.uid();
    new.validated_at := now();
  end if;
  return new;
end $$;
revoke all on function public.protect_ai_analysis_columns() from public, anon, authenticated;
drop trigger if exists ai_analyses_protect on public.ai_analyses;
create trigger ai_analyses_protect before update on public.ai_analyses
  for each row execute function public.protect_ai_analysis_columns();

-- 4. Limitation de débit : plafond pour les analyses lancées par le personnel
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
    ('ai:cv', 5, 3600), ('ai:profile', 5, 3600), ('ai:cvimp', 5, 3600), ('ai:plan', 5, 3600), ('ai:chat', 40, 3600),
    ('ai:staff', 60, 3600)
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

-- 5. Version du schéma attendue par l'application
create or replace function public.app_schema_version()
returns integer language sql immutable set search_path = public as $$ select 15 $$;
revoke all on function public.app_schema_version() from public, anon;
grant execute on function public.app_schema_version() to authenticated, service_role;
