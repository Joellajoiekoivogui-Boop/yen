-- =============================================================================
-- Migration 4 : moteur d'évaluation, compétences démontrées et analyses IA
-- =============================================================================
create type public.question_type as enum (
  'choix_unique', 'choix_multiple', 'reponse_courte', 'reponse_longue', 'etude_de_cas', 'exercice_pratique'
);

create table public.assessments (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) <= 200),
  description text not null default '',
  domain_id uuid not null references public.engineering_domains(id) on delete restrict,
  level public.skill_level not null default 'debutant',
  assessment_type text not null default 'questionnaire'
    check (assessment_type in ('questionnaire', 'exercice_pratique', 'etude_de_cas', 'scenario', 'evaluation_formateur', 'portfolio')),
  duration_minutes integer not null default 20 check (duration_minutes between 1 and 480),
  passing_score numeric(5,2) not null default 60 check (passing_score between 0 and 100),
  scoring_rules text not null default '',   -- barème explicite, affiché au candidat
  status text not null default 'brouillon' check (status in ('brouillon', 'publie', 'archive')),
  version integer not null default 1,
  max_attempts integer check (max_attempts is null or max_attempts > 0),
  cooldown_hours integer not null default 24 check (cooldown_hours >= 0),
  created_by uuid references public.profiles(id) on delete set null,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index assessments_domain_idx on public.assessments (domain_id, status);
create trigger assessments_updated_at before update on public.assessments
  for each row execute function public.set_updated_at();

create table public.assessment_skills (
  assessment_id uuid not null references public.assessments(id) on delete cascade,
  skill_id uuid not null references public.skills(id) on delete cascade,
  primary key (assessment_id, skill_id)
);

create table public.assessment_questions (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references public.assessments(id) on delete cascade,
  position integer not null default 0,
  question_type public.question_type not null,
  prompt text not null check (char_length(prompt) <= 5000),
  points numeric(6,2) not null default 1 check (points > 0),
  skill_id uuid references public.skills(id) on delete set null,
  accepted_answers text[] not null default '{}',     -- réponses courtes acceptées (normalisées)
  rubric jsonb not null default '[]'::jsonb,         -- grille : [{"criterion": "...", "points": 2}]
  explanation text,                                  -- affichée après correction
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index assessment_questions_assessment_idx on public.assessment_questions (assessment_id, position);
create trigger assessment_questions_updated_at before update on public.assessment_questions
  for each row execute function public.set_updated_at();

create table public.assessment_options (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.assessment_questions(id) on delete cascade,
  position integer not null default 0,
  label text not null check (char_length(label) <= 1000),
  is_correct boolean not null default false
);
create index assessment_options_question_idx on public.assessment_options (question_id, position);

create table public.assessment_attempts (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references public.assessments(id) on delete cascade,
  assessment_version integer not null,
  candidate_id uuid not null references public.candidate_profiles(id) on delete cascade,
  status text not null default 'en_cours' check (status in ('en_cours', 'en_correction', 'corrige', 'annule', 'expire')),
  started_at timestamptz not null default now(),
  deadline_at timestamptz not null,
  submitted_at timestamptz,
  graded_at timestamptz,
  max_points numeric(8,2),
  earned_points numeric(8,2),
  score_percent numeric(5,2),
  passed boolean,
  needs_human_review boolean not null default false,
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewer_comment text,
  result_details jsonb not null default '{}'::jsonb,   -- détail par compétence
  recommendations jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);
create index assessment_attempts_candidate_idx on public.assessment_attempts (candidate_id, assessment_id);
create index assessment_attempts_review_idx on public.assessment_attempts (status) where status = 'en_correction';

create table public.assessment_answers (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references public.assessment_attempts(id) on delete cascade,
  question_id uuid not null references public.assessment_questions(id) on delete cascade,
  selected_option_ids uuid[] not null default '{}',
  text_answer text check (text_answer is null or char_length(text_answer) <= 10000),
  auto_points numeric(6,2),
  ai_suggested_points numeric(6,2),
  ai_feedback text,
  manual_points numeric(6,2),
  final_points numeric(6,2),
  reviewer_comment text,
  graded_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (attempt_id, question_id)
);

-- Compétences DÉMONTRÉES : chaque ligne est une preuve traçable.
create table public.skill_assessments (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references public.candidate_profiles(id) on delete cascade,
  skill_id uuid not null references public.skills(id) on delete cascade,
  level public.skill_level not null,
  score_percent numeric(5,2) check (score_percent is null or score_percent between 0 and 100),
  source text not null check (source in ('questionnaire', 'exercice', 'projet', 'evaluateur', 'retour_partenaire')),
  attempt_id uuid references public.assessment_attempts(id) on delete set null,
  project_id uuid references public.candidate_projects(id) on delete set null,
  assessed_by uuid references public.profiles(id) on delete set null,
  confidence text not null default 'moyenne' check (confidence in ('faible', 'moyenne', 'elevee')),
  status text not null default 'valide' check (status in ('valide', 'en_attente', 'conteste', 'invalide')),
  notes text,
  assessed_at timestamptz not null default now(),
  -- un questionnaire ne peut jamais attribuer seul le niveau expert
  check (not (source = 'questionnaire' and level = 'expert'))
);
create index skill_assessments_candidate_idx on public.skill_assessments (candidate_id, skill_id);
create index skill_assessments_skill_idx on public.skill_assessments (skill_id, level) where status = 'valide';

-- -----------------------------------------------------------------------------
-- Analyses IA : stockées séparément des données confirmées.
-- -----------------------------------------------------------------------------
create table public.ai_analyses (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid references public.candidate_profiles(id) on delete cascade,
  kind text not null check (kind in (
    'extraction_cv', 'analyse_profil', 'recommandation_metiers', 'amelioration_cv',
    'plan_progression', 'synthese_responsable', 'correction_reponse', 'resume_rapprochement'
  )),
  provider text not null,
  model text,
  prompt_version text not null,
  status text not null check (status in ('reussi', 'partiel', 'echoue', 'non_configure')),
  input_refs jsonb not null default '[]'::jsonb,   -- sources utilisées : [{"type":"cv","id":"..."}]
  output jsonb,
  error text,
  validation_status text not null default 'en_attente'
    check (validation_status in ('en_attente', 'valide', 'corrige', 'conteste', 'rejete')),
  correction jsonb,
  correction_note text,
  validated_by uuid references public.profiles(id) on delete set null,
  validated_at timestamptz,
  document_id uuid references public.candidate_documents(id) on delete set null,
  attempt_id uuid references public.assessment_attempts(id) on delete set null,
  offer_id uuid,
  superseded_by uuid references public.ai_analyses(id) on delete set null,
  duration_ms integer,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index ai_analyses_candidate_idx on public.ai_analyses (candidate_id, kind, created_at desc);

create table public.ai_recommendations (
  id uuid primary key default gen_random_uuid(),
  analysis_id uuid references public.ai_analyses(id) on delete cascade,
  candidate_id uuid not null references public.candidate_profiles(id) on delete cascade,
  rec_type text not null check (rec_type in ('metier', 'formation', 'projet', 'cv', 'competence', 'entretien')),
  title text not null,
  body text not null default '',
  occupation_id uuid references public.occupations(id) on delete set null,
  skill_id uuid references public.skills(id) on delete set null,
  priority integer not null default 2 check (priority between 1 and 3),
  status text not null default 'active' check (status in ('active', 'ignoree', 'terminee')),
  source_refs jsonb not null default '[]'::jsonb,
  origin text not null default 'ia' check (origin in ('ia', 'regles', 'evaluateur')),
  created_at timestamptz not null default now()
);
create index ai_recommendations_candidate_idx on public.ai_recommendations (candidate_id, status);

create or replace function public.protect_recommendation_columns()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or public.is_staff() then return new; end if;
  if (to_jsonb(new) - 'status') is distinct from (to_jsonb(old) - 'status') then
    raise exception 'Seul le statut d''une recommandation peut être modifié' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger ai_recommendations_protect before update on public.ai_recommendations
  for each row execute function public.protect_recommendation_columns();
