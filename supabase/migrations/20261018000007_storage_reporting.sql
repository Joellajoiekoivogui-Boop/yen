-- =============================================================================
-- Migration 7 : stockage privé des documents et fonctions de reporting
-- =============================================================================

-- Bucket privé : aucun accès public, PDF uniquement, 10 Mo maximum
-- (la limite applicative configurable est vérifiée côté serveur).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('candidate-documents', 'candidate-documents', false, 10485760, array['application/pdf'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Chemin imposé : <user_id>/<uuid>.pdf
create policy "candidate_documents_insert_own" on storage.objects for insert to authenticated
  with check (bucket_id = 'candidate-documents' and (storage.foldername(name))[1] = auth.uid()::text
              and lower(name) like '%.pdf');

create policy "candidate_documents_select" on storage.objects for select to authenticated
  using (bucket_id = 'candidate-documents'
         and ((storage.foldername(name))[1] = auth.uid()::text or public.has_permission('documents.read')));

create policy "candidate_documents_delete_own" on storage.objects for delete to authenticated
  using (bucket_id = 'candidate-documents' and (storage.foldername(name))[1] = auth.uid()::text);
-- Pas de politique UPDATE : un fichier n'est jamais écrasé, une nouvelle version est créée.

-- -----------------------------------------------------------------------------
-- Statistiques du tableau de bord (données réelles uniquement ; les données de
-- démonstration sont exclues par défaut et signalées lorsqu'elles sont incluses)
-- -----------------------------------------------------------------------------
create or replace function public.admin_overview_stats(p_include_demo boolean default false)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v jsonb;
begin
  if not (public.has_permission('reports.view') or public.has_permission('candidates.read')) then
    raise exception 'Permission insuffisante' using errcode = '42501';
  end if;

  with c as (
    select cp.* from public.candidate_profiles cp join public.profiles p on p.id = cp.user_id
    where p.is_active and (p_include_demo or not cp.is_demo)
  )
  select jsonb_build_object(
    'candidates_total', (select count(*) from c),
    'profiles_completed', (select count(*) from c where c.headline is not null and c.summary is not null
                             and c.primary_domain_id is not null
                             and exists (select 1 from public.candidate_skills s where s.candidate_id = c.id)
                             and exists (select 1 from public.candidate_education e where e.candidate_id = c.id)),
    'cv_available', (select count(distinct d.candidate_id) from public.candidate_documents d join c on c.id = d.candidate_id
                     where d.kind = 'cv' and d.is_current and d.deleted_at is null),
    'assessments_completed', (select count(*) from public.assessment_attempts a join c on c.id = a.candidate_id where a.status = 'corrige'),
    'ready_for_shortlist', (select count(*) from c where c.pipeline_status = 'pret_preselection'),
    'offers_active', (select count(*) from public.job_offers o where o.status = 'publiee' and (p_include_demo or not o.is_demo)
                      and (o.deadline is null or o.deadline >= current_date)),
    'applications_in_progress', (select count(*) from public.applications a join c on c.id = a.candidate_id
                                 where a.status not in ('acceptee', 'refusee', 'retiree')),
    'internships_confirmed', (select count(*) from public.placements pl join c on c.id = pl.candidate_id
                              where pl.placement_type = 'stage' and pl.confirmation_status = 'confirme'),
    'jobs_confirmed', (select count(*) from public.placements pl join c on c.id = pl.candidate_id
                       where pl.placement_type = 'emploi' and pl.confirmation_status = 'confirme'),
    'placements_declared_unconfirmed', (select count(*) from public.placements pl join c on c.id = pl.candidate_id
                                        where pl.confirmation_status = 'declare'),
    'pending_reviews', (select count(*) from public.assessment_attempts a join c on c.id = a.candidate_id where a.status = 'en_correction'),
    'demo_data_included', p_include_demo,
    'demo_candidates', (select count(*) from public.candidate_profiles where is_demo),
    'skills_by_domain', coalesce((
      select jsonb_agg(jsonb_build_object('domain', d.name, 'slug', d.slug, 'demonstrated', x.n_valid, 'candidates', x.n_cand) order by x.n_valid desc)
      from (
        select s.domain_id, count(*) as n_valid, count(distinct sa.candidate_id) as n_cand
        from public.skill_assessments sa
        join c on c.id = sa.candidate_id
        join public.skills s on s.id = sa.skill_id
        where sa.status = 'valide' and s.domain_id is not null
        group by s.domain_id
      ) x join public.engineering_domains d on d.id = x.domain_id
    ), '[]'::jsonb),
    'pipeline', coalesce((select jsonb_object_agg(pipeline_status, n) from (
      select pipeline_status, count(*) n from c group by pipeline_status) y), '{}'::jsonb)
  ) into v;
  return v;
end $$;

-- -----------------------------------------------------------------------------
-- Rapport d'insertion professionnelle.
-- Dénominateur explicite : candidats actifs inscrits avant la fin de la période
-- dont le statut est « diplômé » ou « en recherche d'emploi », ou dont l'année
-- de diplomation est antérieure ou égale à l'année de fin de période.
-- Numérateur : candidats du dénominateur ayant au moins un placement CONFIRMÉ
-- débutant dans la période. Les placements déclarés non confirmés et les
-- candidatures en cours sont comptés séparément et n'entrent pas dans le taux.
-- -----------------------------------------------------------------------------
create or replace function public.insertion_report(p_start date, p_end date, p_include_demo boolean default false)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v jsonb;
begin
  if not public.has_permission('reports.view') then
    raise exception 'Permission insuffisante' using errcode = '42501';
  end if;
  if p_end < p_start then raise exception 'Période invalide'; end if;

  with denom as (
    select cp.id from public.candidate_profiles cp join public.profiles p on p.id = cp.user_id
    where p.is_active and cp.created_at::date <= p_end and (p_include_demo or not cp.is_demo)
      and (cp.status in ('diplome', 'en_recherche') or (cp.graduation_year is not null and cp.graduation_year <= extract(year from p_end)))
  ),
  pl as (
    select pl.* from public.placements pl join denom d on d.id = pl.candidate_id
    where pl.start_date between p_start and p_end
  )
  select jsonb_build_object(
    'period_start', p_start,
    'period_end', p_end,
    'denominator', (select count(*) from denom),
    'denominator_definition', 'Candidats actifs inscrits avant la fin de la période, diplômés ou en recherche d''emploi (ou année de diplomation ≤ année de fin de période)',
    'placed_confirmed', (select count(distinct candidate_id) from pl where confirmation_status = 'confirme'),
    'internships_confirmed', (select count(*) from pl where confirmation_status = 'confirme' and placement_type = 'stage'),
    'jobs_confirmed', (select count(*) from pl where confirmation_status = 'confirme' and placement_type = 'emploi'),
    'placements_declared_unconfirmed', (select count(*) from pl where confirmation_status = 'declare'),
    'applications_in_progress', (select count(*) from public.applications a join denom d on d.id = a.candidate_id
                                 where a.status not in ('acceptee', 'refusee', 'retiree')),
    'insertion_rate', case when (select count(*) from denom) = 0 then null
                      else round(100.0 * (select count(distinct candidate_id) from pl where confirmation_status = 'confirme') / (select count(*) from denom), 1) end,
    'by_month', coalesce((select jsonb_agg(jsonb_build_object('month', m, 'stages', s, 'emplois', e) order by m) from (
        select to_char(date_trunc('month', start_date), 'YYYY-MM') m,
               count(*) filter (where placement_type = 'stage') s,
               count(*) filter (where placement_type = 'emploi') e
        from pl where confirmation_status = 'confirme' group by 1) z), '[]'::jsonb),
    'by_domain', coalesce((select jsonb_agg(jsonb_build_object('domain', coalesce(dm.name, 'Non renseigné'), 'placed', n) order by n desc) from (
        select cp.primary_domain_id, count(distinct pl.candidate_id) n from pl join public.candidate_profiles cp on cp.id = pl.candidate_id
        where pl.confirmation_status = 'confirme' group by 1) w left join public.engineering_domains dm on dm.id = w.primary_domain_id), '[]'::jsonb),
    'demo_data_included', p_include_demo
  ) into v;
  return v;
end $$;

grant execute on function public.admin_overview_stats(boolean) to authenticated;
grant execute on function public.insertion_report(date, date, boolean) to authenticated;
