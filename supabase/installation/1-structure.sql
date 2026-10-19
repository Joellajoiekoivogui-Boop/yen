-- YEN Career Bridge — ÉTAPE 1/2 : tables, sécurité (RLS), stockage. Coller dans Supabase > SQL Editor > Run.

-- ===== supabase/migrations/20261018000001_foundation_identity.sql =====
-- =============================================================================
-- YEN Career Bridge — Migration 1 : fondations, identité, rôles et permissions
-- =============================================================================
create extension if not exists pgcrypto with schema extensions;

-- -----------------------------------------------------------------------------
-- Types énumérés
-- -----------------------------------------------------------------------------
create type public.app_role as enum (
  'super_admin',        -- administrateur principal YEN
  'insertion_manager',  -- responsable d'insertion
  'evaluator',          -- évaluateur / formateur
  'partner_manager',    -- gestionnaire de partenaires
  'candidate',          -- étudiant ou diplômé
  'partner'             -- recruteur d'une organisation partenaire
);

create type public.skill_level as enum ('debutant', 'intermediaire', 'avance', 'expert');
create type public.candidate_status as enum ('etudiant', 'diplome', 'stagiaire', 'en_recherche');
create type public.opportunity_type as enum ('stage', 'emploi', 'alternance', 'mission');
create type public.availability_status as enum ('immediate', 'moins_1_mois', 'un_a_trois_mois', 'plus_tard', 'indisponible');
create type public.data_source as enum ('saisie_manuelle', 'extraction_cv_validee', 'evaluateur', 'import');
create type public.verification_status as enum ('non_verifie', 'verifie', 'rejete');

create type public.pipeline_status as enum (
  'profil_incomplet',
  'en_evaluation',
  'pret_preselection',
  'preselectionne',
  'proposition_envoyee',
  'candidature_transmise',
  'entretien_programme',
  'attente_decision',
  'stage_obtenu',
  'emploi_obtenu',
  'candidature_refusee',
  'candidature_retiree',
  'suivi_post_placement'
);

-- -----------------------------------------------------------------------------
-- Utilitaires
-- -----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- -----------------------------------------------------------------------------
-- Profils (1 ligne par utilisateur authentifié). Aucun rôle n'est stocké ici :
-- les rôles vivent dans user_roles et ne sont modifiables que par un
-- administrateur habilité.
-- -----------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  first_name text not null default '' check (char_length(first_name) <= 100),
  last_name text not null default '' check (char_length(last_name) <= 100),
  email text not null,
  phone text check (phone is null or char_length(phone) <= 30),
  city text check (city is null or char_length(city) <= 100),
  country text not null default 'Guinée' check (char_length(country) <= 100),
  account_type text not null default 'candidate' check (account_type in ('candidate', 'partner', 'staff')),
  is_active boolean not null default true,
  deactivated_at timestamptz,
  deactivation_reason text,
  is_demo boolean not null default false,
  last_sign_in_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index profiles_email_idx on public.profiles (lower(email));
create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- Permissions et rôles
-- -----------------------------------------------------------------------------
create table public.permissions (
  code text primary key,
  description text not null
);

create table public.role_permissions (
  role public.app_role not null,
  permission_code text not null references public.permissions(code) on delete cascade,
  primary key (role, permission_code)
);

create table public.user_roles (
  user_id uuid not null references public.profiles(id) on delete cascade,
  role public.app_role not null,
  granted_by uuid references public.profiles(id) on delete set null,
  granted_at timestamptz not null default now(),
  primary key (user_id, role)
);
create index user_roles_role_idx on public.user_roles (role);

insert into public.permissions (code, description) values
  ('users.manage',         'Gérer les comptes (activation, désactivation)'),
  ('roles.manage',         'Attribuer et retirer des rôles'),
  ('candidates.read',      'Consulter les profils candidats complets'),
  ('candidates.manage',    'Modifier le suivi des candidats (statut, responsable, signalement)'),
  ('documents.read',       'Consulter les documents privés des candidats (CV, diplômes)'),
  ('notes.manage',         'Lire et écrire des notes internes'),
  ('assessments.manage',   'Créer et publier des évaluations et la banque de questions'),
  ('assessments.review',   'Corriger les réponses libres et valider les compétences'),
  ('catalog.manage',       'Administrer domaines, compétences et métiers'),
  ('partners.manage',      'Gérer les organisations partenaires et leurs accès'),
  ('offers.manage',        'Créer, valider et publier des offres'),
  ('applications.manage',  'Gérer candidatures, présélections et entretiens'),
  ('shares.manage',        'Partager des profils avec des partenaires (avec consentement)'),
  ('placements.manage',    'Enregistrer et confirmer les placements'),
  ('ai.run',               'Lancer des analyses IA sur les profils'),
  ('ai.review',            'Valider, corriger ou contester des analyses IA'),
  ('reports.view',         'Consulter les statistiques et rapports'),
  ('reports.export',       'Exporter des rapports (CSV, PDF)'),
  ('audit.read',           'Consulter le journal d''audit'),
  ('settings.manage',      'Configurer la plateforme');

-- Administrateur principal : toutes les permissions
insert into public.role_permissions (role, permission_code)
  select 'super_admin', code from public.permissions;

insert into public.role_permissions (role, permission_code) values
  ('insertion_manager', 'candidates.read'),
  ('insertion_manager', 'candidates.manage'),
  ('insertion_manager', 'documents.read'),
  ('insertion_manager', 'notes.manage'),
  ('insertion_manager', 'assessments.review'),
  ('insertion_manager', 'offers.manage'),
  ('insertion_manager', 'applications.manage'),
  ('insertion_manager', 'shares.manage'),
  ('insertion_manager', 'placements.manage'),
  ('insertion_manager', 'ai.run'),
  ('insertion_manager', 'ai.review'),
  ('insertion_manager', 'reports.view'),
  ('insertion_manager', 'reports.export'),
  ('evaluator', 'candidates.read'),
  ('evaluator', 'documents.read'),
  ('evaluator', 'notes.manage'),
  ('evaluator', 'assessments.manage'),
  ('evaluator', 'assessments.review'),
  ('evaluator', 'ai.review'),
  ('partner_manager', 'partners.manage'),
  ('partner_manager', 'offers.manage'),
  ('partner_manager', 'shares.manage'),
  ('partner_manager', 'reports.view');

-- -----------------------------------------------------------------------------
-- Fonctions d'autorisation (SECURITY DEFINER pour éviter la récursion RLS)
-- -----------------------------------------------------------------------------
create or replace function public.has_role(p_role public.app_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.user_roles ur
    join public.profiles p on p.id = ur.user_id
    where ur.user_id = auth.uid() and ur.role = p_role and p.is_active
  )
$$;

create or replace function public.has_permission(p_code text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from public.user_roles ur
    join public.role_permissions rp on rp.role = ur.role
    join public.profiles p on p.id = ur.user_id
    where ur.user_id = auth.uid() and rp.permission_code = p_code and p.is_active
  )
$$;

create or replace function public.is_staff()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.user_roles ur
    join public.profiles p on p.id = ur.user_id
    where ur.user_id = auth.uid() and p.is_active
      and ur.role in ('super_admin', 'insertion_manager', 'evaluator', 'partner_manager')
  )
$$;

create or replace function public.current_permissions()
returns setof text language sql stable security definer set search_path = public as $$
  select distinct rp.permission_code
  from public.user_roles ur
  join public.role_permissions rp on rp.role = ur.role
  join public.profiles p on p.id = ur.user_id
  where ur.user_id = auth.uid() and p.is_active
$$;

-- Un utilisateur ne peut jamais modifier lui-même les colonnes sensibles
-- de son profil (activation, type de compte, démo).
create or replace function public.protect_profile_columns()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return new; end if; -- service / migrations
  if public.has_permission('users.manage') then return new; end if;
  if new.is_active is distinct from old.is_active
     or new.deactivated_at is distinct from old.deactivated_at
     or new.deactivation_reason is distinct from old.deactivation_reason
     or new.account_type is distinct from old.account_type
     or new.is_demo is distinct from old.is_demo
     or new.email is distinct from old.email
     or new.id is distinct from old.id then
    raise exception 'Modification non autorisée de champs protégés du profil' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger profiles_protect before update on public.profiles
  for each row execute function public.protect_profile_columns();

-- Seul un administrateur principal peut attribuer le rôle super_admin.
-- Le premier administrateur est créé hors application (voir scripts/grant-role.sql).
create or replace function public.guard_user_roles()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_role public.app_role := coalesce(new.role, old.role);
begin
  if auth.uid() is null then return coalesce(new, old); end if;
  if not public.has_permission('roles.manage') then
    raise exception 'Permission roles.manage requise' using errcode = '42501';
  end if;
  if v_role = 'super_admin' and not public.has_role('super_admin') then
    raise exception 'Seul un administrateur principal peut gérer ce rôle' using errcode = '42501';
  end if;
  if tg_op = 'DELETE' and old.user_id = auth.uid() and old.role = 'super_admin' then
    raise exception 'Un administrateur principal ne peut pas retirer son propre rôle' using errcode = '42501';
  end if;
  if tg_op = 'INSERT' then new.granted_by := auth.uid(); end if;
  return coalesce(new, old);
end $$;
create trigger user_roles_guard before insert or update or delete on public.user_roles
  for each row execute function public.guard_user_roles();

-- -----------------------------------------------------------------------------
-- Paramètres de la plateforme
-- -----------------------------------------------------------------------------
create table public.platform_settings (
  key text primary key,
  value jsonb not null,
  description text,
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);

insert into public.platform_settings (key, value, description) values
  ('matching.default_weights',
   '{"demonstrated_skills": 40, "assessments": 25, "projects": 15, "education": 10, "experience": 10}',
   'Pondération par défaut du score de compatibilité (somme = 100)'),
  ('documents.max_cv_size_mb', '5', 'Taille maximale d''un CV PDF en Mo'),
  ('registration.phone_required', 'false', 'Le numéro de téléphone est-il obligatoire à l''inscription ?'),
  ('offers.partner_requires_validation', 'true', 'Les offres publiées par les partenaires doivent être validées par YEN'),
  ('assessments.auto_max_level', '"avance"', 'Niveau maximal attribuable automatiquement par un questionnaire (jamais expert)'),
  ('reports.insertion_window_months', '6', 'Fenêtre par défaut (en mois) du calcul du taux d''insertion');

-- -----------------------------------------------------------------------------
-- Limitation de débit (partagée entre instances serveur)
-- -----------------------------------------------------------------------------
create table public.rate_limits (
  key text primary key,
  count integer not null default 0,
  window_start timestamptz not null default now()
);

create or replace function public.check_rate_limit(p_key text, p_max integer, p_window_seconds integer)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  v_count integer;
begin
  insert into public.rate_limits as rl (key, count, window_start)
  values (p_key, 1, now())
  on conflict (key) do update
    set count = case when rl.window_start < now() - make_interval(secs => p_window_seconds) then 1 else rl.count + 1 end,
        window_start = case when rl.window_start < now() - make_interval(secs => p_window_seconds) then now() else rl.window_start end
  returning count into v_count;
  return v_count <= p_max;
end $$;
revoke all on function public.check_rate_limit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.check_rate_limit(text, integer, integer) to service_role;

-- ===== supabase/migrations/20261018000002_catalog.sql =====
-- =============================================================================
-- Migration 2 : catalogue des domaines d'ingénierie, compétences et métiers
-- Le catalogue est administrable (aucune donnée métier codée en dur dans l'UI).
-- =============================================================================
create type public.skill_category as enum ('technique', 'transversale', 'outil');
create type public.skill_tier as enum ('fondamentale', 'avancee');
create type public.skill_importance as enum ('obligatoire', 'importante', 'souhaitee');

create table public.engineering_domains (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]+$'),
  name text not null,
  short_description text not null default '',
  description text not null default '',
  tools text[] not null default '{}',
  certifications text[] not null default '{}',
  project_types text[] not null default '{}',
  progression_criteria text not null default '',
  icon text not null default 'cpu',
  position integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger engineering_domains_updated_at before update on public.engineering_domains
  for each row execute function public.set_updated_at();

create table public.skills (
  id uuid primary key default gen_random_uuid(),
  domain_id uuid references public.engineering_domains(id) on delete set null,
  slug text not null unique check (slug ~ '^[a-z0-9-]+$'),
  name text not null,
  category public.skill_category not null default 'technique',
  tier public.skill_tier not null default 'fondamentale',
  description text not null default '',
  -- Critères observables par niveau : {"debutant": "...", "intermediaire": "...", "avance": "...", "expert": "..."}
  level_criteria jsonb not null default '{}'::jsonb,
  -- Synonymes utilisés pour la normalisation (ex. "JS" -> JavaScript)
  aliases text[] not null default '{}',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index skills_domain_idx on public.skills (domain_id);
create index skills_name_idx on public.skills (lower(name));
create trigger skills_updated_at before update on public.skills
  for each row execute function public.set_updated_at();

create table public.occupations (
  id uuid primary key default gen_random_uuid(),
  domain_id uuid not null references public.engineering_domains(id) on delete cascade,
  slug text not null unique check (slug ~ '^[a-z0-9-]+$'),
  title text not null,
  description text not null default '',
  typical_education text not null default '',
  -- Pondération spécifique au métier (null = pondération par défaut de la plateforme)
  scoring_weights jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index occupations_domain_idx on public.occupations (domain_id);
create trigger occupations_updated_at before update on public.occupations
  for each row execute function public.set_updated_at();

create table public.occupation_skills (
  occupation_id uuid not null references public.occupations(id) on delete cascade,
  skill_id uuid not null references public.skills(id) on delete cascade,
  required_level public.skill_level not null default 'intermediaire',
  importance public.skill_importance not null default 'importante',
  primary key (occupation_id, skill_id)
);
create index occupation_skills_skill_idx on public.occupation_skills (skill_id);

-- ===== supabase/migrations/20261018000003_candidates.sql =====
-- =============================================================================
-- Migration 3 : profils candidats, parcours, documents et consentements
-- =============================================================================
create sequence public.candidate_code_seq start 1;

create table public.candidate_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.profiles(id) on delete cascade,
  -- Identifiant public lisible, généré par le serveur. Il n'est JAMAIS utilisé
  -- pour l'accès aux données (les routes utilisent l'UUID + RLS).
  public_code text not null unique default ('YEN-CB-' || lpad(nextval('public.candidate_code_seq')::text, 6, '0')),
  institution text check (institution is null or char_length(institution) <= 200),
  yen_program text check (yen_program is null or char_length(yen_program) <= 200),
  education_level text check (education_level is null or char_length(education_level) <= 100),
  graduation_year integer check (graduation_year is null or graduation_year between 1970 and 2100),
  status public.candidate_status not null default 'etudiant',
  primary_domain_id uuid references public.engineering_domains(id) on delete set null,
  interest_area text check (interest_area is null or char_length(interest_area) <= 300),
  availability public.availability_status not null default 'immediate',
  opportunity_types public.opportunity_type[] not null default '{}',
  headline text check (headline is null or char_length(headline) <= 200),
  summary text check (summary is null or char_length(summary) <= 3000),
  linkedin_url text,
  portfolio_url text,
  github_url text,
  -- Champs de suivi gérés exclusivement par YEN
  pipeline_status public.pipeline_status not null default 'profil_incomplet',
  assigned_manager_id uuid references public.profiles(id) on delete set null,
  review_flag boolean not null default false,
  review_flag_reason text,
  is_demo boolean not null default false,
  last_activity_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index candidate_profiles_domain_idx on public.candidate_profiles (primary_domain_id);
create index candidate_profiles_pipeline_idx on public.candidate_profiles (pipeline_status);
create index candidate_profiles_grad_idx on public.candidate_profiles (graduation_year);
create trigger candidate_profiles_updated_at before update on public.candidate_profiles
  for each row execute function public.set_updated_at();

create or replace function public.auth_candidate_id()
returns uuid language sql stable security definer set search_path = public as $$
  select id from public.candidate_profiles where user_id = auth.uid()
$$;

-- Le candidat ne peut pas modifier les champs de suivi YEN.
create or replace function public.protect_candidate_columns()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or public.has_permission('candidates.manage') then return new; end if;
  if new.pipeline_status is distinct from old.pipeline_status
     or new.assigned_manager_id is distinct from old.assigned_manager_id
     or new.review_flag is distinct from old.review_flag
     or new.review_flag_reason is distinct from old.review_flag_reason
     or new.public_code is distinct from old.public_code
     or new.user_id is distinct from old.user_id
     or new.is_demo is distinct from old.is_demo then
    raise exception 'Modification non autorisée des champs de suivi' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger candidate_profiles_protect before update on public.candidate_profiles
  for each row execute function public.protect_candidate_columns();

-- -----------------------------------------------------------------------------
-- Parcours
-- -----------------------------------------------------------------------------
create table public.candidate_education (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references public.candidate_profiles(id) on delete cascade,
  institution text not null check (char_length(institution) <= 200),
  degree text not null check (char_length(degree) <= 200),
  field_of_study text check (field_of_study is null or char_length(field_of_study) <= 200),
  start_year integer check (start_year is null or start_year between 1970 and 2100),
  end_year integer check (end_year is null or end_year between 1970 and 2100),
  is_yen_program boolean not null default false,
  description text check (description is null or char_length(description) <= 2000),
  source public.data_source not null default 'saisie_manuelle',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_year is null or start_year is null or end_year >= start_year)
);
create index candidate_education_candidate_idx on public.candidate_education (candidate_id);
create trigger candidate_education_updated_at before update on public.candidate_education
  for each row execute function public.set_updated_at();

create table public.candidate_experiences (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references public.candidate_profiles(id) on delete cascade,
  title text not null check (char_length(title) <= 200),
  organization text not null check (char_length(organization) <= 200),
  experience_type text not null default 'emploi'
    check (experience_type in ('stage', 'emploi', 'alternance', 'mission', 'benevolat', 'projet_academique')),
  city text,
  start_date date not null,
  end_date date,
  is_current boolean not null default false,
  description text check (description is null or char_length(description) <= 4000),
  achievements text check (achievements is null or char_length(achievements) <= 4000),
  domain_id uuid references public.engineering_domains(id) on delete set null,
  source public.data_source not null default 'saisie_manuelle',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date is null or end_date >= start_date)
);
create index candidate_experiences_candidate_idx on public.candidate_experiences (candidate_id);
create trigger candidate_experiences_updated_at before update on public.candidate_experiences
  for each row execute function public.set_updated_at();

create table public.candidate_projects (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references public.candidate_profiles(id) on delete cascade,
  title text not null check (char_length(title) <= 200),
  description text not null check (char_length(description) <= 5000),
  role text check (role is null or char_length(role) <= 200),
  technologies text[] not null default '{}',
  outcomes text check (outcomes is null or char_length(outcomes) <= 3000),
  project_url text,
  repository_url text,
  start_date date,
  end_date date,
  domain_id uuid references public.engineering_domains(id) on delete set null,
  verification_status public.verification_status not null default 'non_verifie',
  verified_by uuid references public.profiles(id) on delete set null,
  verified_at timestamptz,
  verification_note text,
  source public.data_source not null default 'saisie_manuelle',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index candidate_projects_candidate_idx on public.candidate_projects (candidate_id);
create trigger candidate_projects_updated_at before update on public.candidate_projects
  for each row execute function public.set_updated_at();

create table public.project_skills (
  project_id uuid not null references public.candidate_projects(id) on delete cascade,
  skill_id uuid not null references public.skills(id) on delete cascade,
  primary key (project_id, skill_id)
);
create index project_skills_skill_idx on public.project_skills (skill_id);

-- Le candidat ne peut pas s'auto-vérifier un projet.
create or replace function public.protect_project_verification()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or public.has_permission('assessments.review') then return new; end if;
  if tg_op = 'INSERT' then
    new.verification_status := 'non_verifie'; new.verified_by := null; new.verified_at := null; new.verification_note := null;
  elsif new.verification_status is distinct from old.verification_status
     or new.verified_by is distinct from old.verified_by
     or new.verified_at is distinct from old.verified_at
     or new.verification_note is distinct from old.verification_note then
    raise exception 'La vérification d''un projet est réservée à YEN' using errcode = '42501';
  elsif new.title is distinct from old.title or new.description is distinct from old.description then
    -- toute modification substantielle annule une vérification précédente
    new.verification_status := 'non_verifie'; new.verified_by := null; new.verified_at := null;
  end if;
  return new;
end $$;
create trigger candidate_projects_protect before insert or update on public.candidate_projects
  for each row execute function public.protect_project_verification();

-- -----------------------------------------------------------------------------
-- Documents privés (CV, diplômes, attestations)
-- -----------------------------------------------------------------------------
create table public.candidate_documents (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references public.candidate_profiles(id) on delete cascade,
  kind text not null check (kind in ('cv', 'diplome', 'certification', 'autre')),
  storage_path text not null unique,
  original_filename text not null check (char_length(original_filename) <= 255),
  mime_type text not null check (mime_type = 'application/pdf'),
  size_bytes integer not null check (size_bytes > 0),
  sha256 text not null check (sha256 ~ '^[a-f0-9]{64}$'),
  version integer not null default 1,
  is_current boolean not null default true,
  scan_status text not null default 'non_analyse'
    check (scan_status in ('non_analyse', 'controle_basique_ok', 'sain', 'suspect', 'rejete')),
  scan_details text,
  page_count integer,
  text_extraction_status text not null default 'en_attente'
    check (text_extraction_status in ('en_attente', 'extrait', 'ocr_requis', 'echoue')),
  uploaded_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index candidate_documents_candidate_idx on public.candidate_documents (candidate_id, kind);
create unique index candidate_documents_one_current_cv on public.candidate_documents (candidate_id)
  where kind = 'cv' and is_current and deleted_at is null;

-- Texte extrait (séparé pour ne pas alourdir les listes)
create table public.candidate_document_texts (
  document_id uuid primary key references public.candidate_documents(id) on delete cascade,
  candidate_id uuid not null references public.candidate_profiles(id) on delete cascade,
  method text not null check (method in ('pdf_text', 'ocr_ia')),
  content text not null,
  created_at timestamptz not null default now()
);

create table public.candidate_certifications (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references public.candidate_profiles(id) on delete cascade,
  name text not null check (char_length(name) <= 200),
  issuer text not null check (char_length(issuer) <= 200),
  issue_date date,
  expiry_date date,
  credential_id text,
  credential_url text,
  document_id uuid references public.candidate_documents(id) on delete set null,
  verification_status public.verification_status not null default 'non_verifie',
  source public.data_source not null default 'saisie_manuelle',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index candidate_certifications_candidate_idx on public.candidate_certifications (candidate_id);
create trigger candidate_certifications_updated_at before update on public.candidate_certifications
  for each row execute function public.set_updated_at();

create or replace function public.protect_certification_verification()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or public.has_permission('assessments.review') then return new; end if;
  if tg_op = 'INSERT' then
    new.verification_status := 'non_verifie';
  elsif new.verification_status is distinct from old.verification_status then
    raise exception 'La vérification d''une certification est réservée à YEN' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger candidate_certifications_protect before insert or update on public.candidate_certifications
  for each row execute function public.protect_certification_verification();

-- Compétences DÉCLARÉES (jamais considérées comme démontrées)
create table public.candidate_skills (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references public.candidate_profiles(id) on delete cascade,
  skill_id uuid not null references public.skills(id) on delete cascade,
  self_level public.skill_level not null default 'debutant',
  years_experience numeric(4,1) check (years_experience is null or years_experience between 0 and 60),
  evidence_note text check (evidence_note is null or char_length(evidence_note) <= 1000),
  source public.data_source not null default 'saisie_manuelle',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (candidate_id, skill_id)
);
create index candidate_skills_skill_idx on public.candidate_skills (skill_id);
create trigger candidate_skills_updated_at before update on public.candidate_skills
  for each row execute function public.set_updated_at();

create table public.candidate_languages (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references public.candidate_profiles(id) on delete cascade,
  language text not null check (char_length(language) <= 60),
  proficiency text not null check (proficiency in ('notions', 'intermediaire', 'courant', 'natif')),
  source public.data_source not null default 'saisie_manuelle',
  unique (candidate_id, language)
);

-- -----------------------------------------------------------------------------
-- Consentements explicites
-- -----------------------------------------------------------------------------
create table public.candidate_consents (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references public.candidate_profiles(id) on delete cascade,
  consent_type text not null check (consent_type in (
    'conditions_utilisation',   -- acceptation des CGU et de la politique de confidentialité
    'traitement_ia',            -- analyse du profil par l'IA
    'visibilite_vivier',        -- apparaître dans le vivier de talents consulté par YEN pour les offres
    'partage_partenaires',      -- partage du profil avec des partenaires sélectionnés par YEN
    'notifications_externes'    -- e-mail / SMS / WhatsApp
  )),
  granted boolean not null,
  policy_version text not null default '2026-10',
  updated_at timestamptz not null default now(),
  unique (candidate_id, consent_type)
);

create or replace function public.has_consent(p_candidate_id uuid, p_type text)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select granted from public.candidate_consents
                   where candidate_id = p_candidate_id and consent_type = p_type), false)
$$;

-- -----------------------------------------------------------------------------
-- Création automatique du profil à l'inscription.
-- Les métadonnées fournies par l'utilisateur ne peuvent JAMAIS attribuer un rôle
-- privilégié : seul "candidate" est attribué automatiquement. Les valeurs
-- énumérées sont validées ; une valeur inconnue est ignorée (valeur par défaut).
-- La création de l'organisation d'un partenaire est enregistrée au statut
-- « en_attente » : l'accès n'est ouvert qu'après validation par YEN.
-- -----------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  v_type text := case when meta ->> 'account_type' = 'partner' then 'partner' else 'candidate' end;
  v_candidate_id uuid;
  v_org_id uuid;
  v_grad integer;
  v_types public.opportunity_type[];
begin
  insert into public.profiles (id, first_name, last_name, email, phone, city, country, account_type)
  values (
    new.id,
    left(coalesce(meta ->> 'first_name', ''), 100),
    left(coalesce(meta ->> 'last_name', ''), 100),
    coalesce(new.email, ''),
    nullif(left(coalesce(meta ->> 'phone', ''), 30), ''),
    nullif(left(coalesce(meta ->> 'city', ''), 100), ''),
    coalesce(nullif(left(meta ->> 'country', 100), ''), 'Guinée'),
    v_type
  );

  if v_type = 'candidate' then
    v_grad := case when (meta ->> 'graduation_year') ~ '^[0-9]{4}$' and (meta ->> 'graduation_year')::int between 1970 and 2100
                   then (meta ->> 'graduation_year')::int end;
    select coalesce(array_agg(t::public.opportunity_type), '{}') into v_types
      from jsonb_array_elements_text(case when jsonb_typeof(meta -> 'opportunity_types') = 'array' then meta -> 'opportunity_types' else '[]'::jsonb end) t
      where t in ('stage', 'emploi', 'alternance', 'mission');

    insert into public.user_roles (user_id, role) values (new.id, 'candidate');
    insert into public.candidate_profiles (
      user_id, institution, yen_program, education_level, graduation_year, status, interest_area, availability, opportunity_types, primary_domain_id
    ) values (
      new.id,
      nullif(left(meta ->> 'institution', 200), ''),
      nullif(left(meta ->> 'yen_program', 200), ''),
      nullif(left(meta ->> 'education_level', 100), ''),
      v_grad,
      case when meta ->> 'status' in ('etudiant', 'diplome', 'stagiaire', 'en_recherche') then (meta ->> 'status')::public.candidate_status else 'etudiant' end,
      nullif(left(meta ->> 'interest_area', 300), ''),
      case when meta ->> 'availability' in ('immediate', 'moins_1_mois', 'un_a_trois_mois', 'plus_tard', 'indisponible')
           then (meta ->> 'availability')::public.availability_status else 'immediate' end,
      v_types,
      (select id from public.engineering_domains where id::text = meta ->> 'primary_domain_id' and is_active)
    ) returning id into v_candidate_id;

    if (meta ->> 'accepted_terms') = 'true' then
      insert into public.candidate_consents (candidate_id, consent_type, granted)
      values (v_candidate_id, 'conditions_utilisation', true);
    end if;
  elsif nullif(trim(meta ->> 'organization_name'), '') is not null then
    insert into public.organizations (name, sector, city, country, contact_name, contact_email, contact_phone, status, portal_enabled, created_by)
    values (
      left(trim(meta ->> 'organization_name'), 200),
      left(coalesce(meta ->> 'organization_sector', ''), 200),
      nullif(left(meta ->> 'city', 100), ''),
      coalesce(nullif(left(meta ->> 'country', 100), ''), 'Guinée'),
      left(trim(coalesce(meta ->> 'first_name', '') || ' ' || coalesce(meta ->> 'last_name', '')), 200),
      new.email,
      nullif(left(coalesce(meta ->> 'phone', ''), 30), ''),
      'en_attente', false, new.id
    ) returning id into v_org_id;
    insert into public.partner_memberships (organization_id, user_id, role_in_org, status)
    values (v_org_id, new.id, 'administrateur_org', 'en_attente');
  end if;
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ===== supabase/migrations/20261018000004_assessments_ai.sql =====
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

-- ===== supabase/migrations/20261018000005_partners_pipeline.sql =====
-- =============================================================================
-- Migration 5 : partenaires, offres, candidatures, entretiens, placements,
-- partages de profils, notifications, notes internes et audit
-- =============================================================================
create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) <= 200),
  sector text not null default '' check (char_length(sector) <= 200),
  description text not null default '' check (char_length(description) <= 5000),
  city text,
  country text not null default 'Guinée',
  website text,
  email text,
  phone text,
  contact_name text,
  contact_email text,
  contact_phone text,
  status text not null default 'en_attente' check (status in ('en_attente', 'actif', 'suspendu', 'inactif')),
  partnership_type text not null default 'recrutement'
    check (partnership_type in ('recrutement', 'stage', 'formation', 'institutionnel', 'autre')),
  portal_enabled boolean not null default false,   -- espace partenaire activé par l'administrateur
  is_public boolean not null default false,        -- affichage sur la page publique, avec autorisation
  public_authorized_at timestamptz,
  is_demo boolean not null default false,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger organizations_updated_at before update on public.organizations
  for each row execute function public.set_updated_at();

create table public.organization_domains (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  domain_id uuid not null references public.engineering_domains(id) on delete cascade,
  primary key (organization_id, domain_id)
);

create table public.organization_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  event_type text not null check (event_type in ('reunion', 'convention', 'recrutement', 'retour', 'autre')),
  description text not null,
  occurred_on date not null default current_date,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.partner_memberships (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role_in_org text not null default 'recruteur' check (role_in_org in ('recruteur', 'administrateur_org')),
  status text not null default 'en_attente' check (status in ('en_attente', 'actif', 'revoque')),
  approved_by uuid references public.profiles(id) on delete set null,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  unique (organization_id, user_id)
);
create index partner_memberships_user_idx on public.partner_memberships (user_id);

create or replace function public.is_partner_member(p_org uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.partner_memberships m
    join public.organizations o on o.id = m.organization_id
    join public.profiles p on p.id = m.user_id
    where m.user_id = auth.uid() and m.organization_id = p_org
      and m.status = 'actif' and o.status = 'actif' and o.portal_enabled and p.is_active
  ) and public.has_role('partner')
$$;

create or replace function public.protect_organization_columns()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or public.has_permission('partners.manage') then return new; end if;
  if new.status is distinct from old.status
     or new.portal_enabled is distinct from old.portal_enabled
     or new.is_public is distinct from old.is_public
     or new.public_authorized_at is distinct from old.public_authorized_at
     or new.is_demo is distinct from old.is_demo then
    raise exception 'Seul YEN peut modifier le statut ou la visibilité d''une organisation' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger organizations_protect before update on public.organizations
  for each row execute function public.protect_organization_columns();

-- -----------------------------------------------------------------------------
-- Offres
-- -----------------------------------------------------------------------------
create table public.job_offers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  title text not null check (char_length(title) <= 200),
  description text not null check (char_length(description) <= 10000),
  offer_type public.opportunity_type not null,
  domain_id uuid references public.engineering_domains(id) on delete set null,
  education_level text,
  min_experience_months integer not null default 0 check (min_experience_months between 0 and 600),
  location text not null default '',
  remote_policy text not null default 'sur_site' check (remote_policy in ('sur_site', 'hybride', 'distance')),
  deadline date,
  positions integer not null default 1 check (positions between 1 and 1000),
  special_conditions text,
  status text not null default 'brouillon'
    check (status in ('brouillon', 'en_validation', 'publiee', 'pourvue', 'fermee', 'archivee')),
  scoring_weights jsonb,   -- pondération spécifique à l'offre (null = métier/plateforme)
  occupation_id uuid references public.occupations(id) on delete set null,
  created_by uuid references public.profiles(id) on delete set null,
  validated_by uuid references public.profiles(id) on delete set null,
  published_at timestamptz,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index job_offers_status_idx on public.job_offers (status, deadline);
create index job_offers_org_idx on public.job_offers (organization_id);
create trigger job_offers_updated_at before update on public.job_offers
  for each row execute function public.set_updated_at();

alter table public.ai_analyses
  add constraint ai_analyses_offer_fk foreign key (offer_id) references public.job_offers(id) on delete set null;

create table public.job_required_skills (
  offer_id uuid not null references public.job_offers(id) on delete cascade,
  skill_id uuid not null references public.skills(id) on delete cascade,
  required_level public.skill_level not null default 'intermediaire',
  is_mandatory boolean not null default false,
  primary key (offer_id, skill_id)
);

-- Un partenaire ne peut pas publier lui-même si la validation YEN est exigée.
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
  if tg_op = 'UPDATE' and (new.validated_by is distinct from old.validated_by or new.is_demo is distinct from old.is_demo
     or new.organization_id is distinct from old.organization_id) then
    raise exception 'Modification non autorisée' using errcode = '42501';
  end if;
  if tg_op = 'INSERT' then new.validated_by := null; new.is_demo := false; new.created_by := auth.uid(); end if;
  if new.status = 'publiee' and new.published_at is null then new.published_at := now(); end if;
  return new;
end $$;
create trigger job_offers_guard before insert or update on public.job_offers
  for each row execute function public.guard_offer_status();

-- -----------------------------------------------------------------------------
-- Candidatures
-- -----------------------------------------------------------------------------
create type public.application_status as enum (
  'soumise',              -- candidature envoyée par le candidat
  'en_revue',             -- examinée par YEN
  'preselectionnee',      -- présélection YEN
  'proposee_partenaire',  -- profil proposé au partenaire
  'entretien_programme',
  'attente_decision',
  'acceptee',
  'refusee',
  'retiree'
);

create table public.applications (
  id uuid primary key default gen_random_uuid(),
  offer_id uuid not null references public.job_offers(id) on delete cascade,
  candidate_id uuid not null references public.candidate_profiles(id) on delete cascade,
  status public.application_status not null default 'soumise',
  origin text not null default 'candidat' check (origin in ('candidat', 'yen')),
  motivation text check (motivation is null or char_length(motivation) <= 5000),
  -- visible par le partenaire uniquement si le candidat a postulé lui-même
  -- ou a consenti au partage (voir trigger)
  visible_to_partner boolean not null default false,
  partner_shortlisted boolean not null default false,
  match_snapshot jsonb,
  decision_reason text,
  decided_by uuid references public.profiles(id) on delete set null,
  decided_at timestamptz,
  submitted_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (offer_id, candidate_id)
);
create index applications_candidate_idx on public.applications (candidate_id);
create index applications_offer_idx on public.applications (offer_id, status);
create trigger applications_updated_at before update on public.applications
  for each row execute function public.set_updated_at();

create or replace function public.guard_application()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_offer public.job_offers%rowtype;
  v_is_owner boolean;
  v_partner boolean;
begin
  select * into v_offer from public.job_offers where id = new.offer_id;
  v_is_owner := new.candidate_id = public.auth_candidate_id();

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
create trigger applications_guard before insert or update on public.applications
  for each row execute function public.guard_application();

create table public.application_events (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.applications(id) on delete cascade,
  from_status public.application_status,
  to_status public.application_status not null,
  note text,
  visible_to_candidate boolean not null default true,
  actor_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index application_events_app_idx on public.application_events (application_id, created_at);

-- Historique automatique des changements de statut
create or replace function public.log_application_event()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into public.application_events (application_id, from_status, to_status, actor_id, note)
    values (new.id, null, new.status, auth.uid(), case when new.origin = 'yen' then 'Associé à l''offre par YEN' else 'Candidature envoyée' end);
  elsif new.status is distinct from old.status then
    insert into public.application_events (application_id, from_status, to_status, actor_id, note)
    values (new.id, old.status, new.status, auth.uid(), new.decision_reason);
  end if;
  return new;
end $$;
create trigger applications_log after insert or update on public.applications
  for each row execute function public.log_application_event();

create table public.interviews (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.applications(id) on delete cascade,
  scheduled_at timestamptz not null,
  duration_minutes integer not null default 45 check (duration_minutes between 5 and 600),
  mode text not null default 'presentiel' check (mode in ('presentiel', 'visio', 'telephone')),
  location text,
  interviewers text,
  status text not null default 'programme' check (status in ('programme', 'realise', 'annule', 'reporte')),
  outcome text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index interviews_application_idx on public.interviews (application_id);
create trigger interviews_updated_at before update on public.interviews
  for each row execute function public.set_updated_at();

-- Retour d'un partenaire après entretien ou stage
create table public.partner_feedback (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.applications(id) on delete cascade,
  author_id uuid references public.profiles(id) on delete set null,
  context text not null default 'entretien' check (context in ('entretien', 'stage', 'emploi')),
  overall_rating integer check (overall_rating between 1 and 5),
  comments text not null check (char_length(comments) <= 5000),
  -- [{"skill_id": "...", "level": "intermediaire", "comment": "..."}]
  skill_ratings jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- Partage contrôlé de profils avec un partenaire
-- -----------------------------------------------------------------------------
create table public.profile_shares (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references public.candidate_profiles(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  offer_id uuid references public.job_offers(id) on delete set null,
  reason text not null check (char_length(reason) <= 1000),
  include_cv boolean not null default true,
  shared_by uuid references public.profiles(id) on delete set null,
  expires_at timestamptz not null default (now() + interval '90 days'),
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create index profile_shares_candidate_idx on public.profile_shares (candidate_id);
create index profile_shares_org_idx on public.profile_shares (organization_id);

create or replace function public.guard_profile_share()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' and not public.has_consent(new.candidate_id, 'partage_partenaires') then
    raise exception 'Le candidat n''a pas consenti au partage de son profil avec les partenaires' using errcode = '42501';
  end if;
  if tg_op = 'INSERT' and auth.uid() is not null then new.shared_by := auth.uid(); end if;
  return new;
end $$;
create trigger profile_shares_guard before insert on public.profile_shares
  for each row execute function public.guard_profile_share();

-- Un partenaire peut-il consulter ce candidat ?
--   - candidature visible sur une offre de son organisation, ou
--   - partage actif (non expiré, non révoqué) ET consentement toujours valide.
create or replace function public.partner_can_view_candidate(p_candidate uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
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
$$;

-- Le partenaire peut-il télécharger le CV ?
create or replace function public.partner_can_view_cv(p_candidate uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
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
$$;

-- -----------------------------------------------------------------------------
-- Placements
-- -----------------------------------------------------------------------------
create table public.placements (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references public.candidate_profiles(id) on delete cascade,
  application_id uuid references public.applications(id) on delete set null,
  organization_id uuid references public.organizations(id) on delete set null,
  organization_name text not null check (char_length(organization_name) <= 200),
  position_title text not null check (char_length(position_title) <= 200),
  placement_type text not null check (placement_type in ('stage', 'emploi')),
  contract_type text not null check (contract_type in ('stage', 'cdd', 'cdi', 'alternance', 'mission', 'autre')),
  start_date date not null,
  end_date date,
  duration_months integer check (duration_months is null or duration_months between 0 and 600),
  follow_up_manager_id uuid references public.profiles(id) on delete set null,
  confirmation_status text not null default 'declare' check (confirmation_status in ('declare', 'confirme', 'annule')),
  confirmed_by uuid references public.profiles(id) on delete set null,
  confirmed_at timestamptz,
  candidate_feedback text,
  organization_feedback text,
  is_demo boolean not null default false,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date is null or end_date >= start_date)
);
create index placements_candidate_idx on public.placements (candidate_id);
create index placements_dates_idx on public.placements (start_date, confirmation_status);
create trigger placements_updated_at before update on public.placements
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- Demandes d'informations complémentaires
-- -----------------------------------------------------------------------------
create table public.info_requests (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references public.candidate_profiles(id) on delete cascade,
  requested_by uuid references public.profiles(id) on delete set null,
  message text not null check (char_length(message) <= 2000),
  response text check (response is null or char_length(response) <= 5000),
  status text not null default 'ouverte' check (status in ('ouverte', 'repondue', 'fermee')),
  created_at timestamptz not null default now(),
  responded_at timestamptz
);

create or replace function public.guard_info_request()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or public.has_permission('candidates.manage') then return new; end if;
  if (to_jsonb(new) - 'response' - 'status' - 'responded_at') is distinct from (to_jsonb(old) - 'response' - 'status' - 'responded_at')
     or new.status not in ('repondue') then
    raise exception 'Vous pouvez uniquement répondre à la demande' using errcode = '42501';
  end if;
  new.responded_at := now();
  return new;
end $$;
create trigger info_requests_guard before update on public.info_requests
  for each row execute function public.guard_info_request();

-- -----------------------------------------------------------------------------
-- Notifications internes (+ file d'envoi externe, désactivée par défaut)
-- -----------------------------------------------------------------------------
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  category text not null check (category in (
    'evaluation', 'recommandation', 'offre', 'candidature', 'profil', 'entretien', 'decision', 'systeme'
  )),
  title text not null,
  body text not null default '',
  link text check (link is null or link ~ '^/'),
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_user_idx on public.notifications (user_id, read_at, created_at desc);

create table public.notification_deliveries (
  id uuid primary key default gen_random_uuid(),
  notification_id uuid not null references public.notifications(id) on delete cascade,
  channel text not null check (channel in ('email', 'sms', 'whatsapp')),
  status text not null default 'en_attente' check (status in ('en_attente', 'envoye', 'echoue', 'ignore')),
  provider text,
  error text,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);

create or replace function public.protect_notification_columns()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return new; end if;
  if (to_jsonb(new) - 'read_at') is distinct from (to_jsonb(old) - 'read_at') then
    raise exception 'Seul l''état de lecture peut être modifié' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger notifications_protect before update on public.notifications
  for each row execute function public.protect_notification_columns();

-- -----------------------------------------------------------------------------
-- Notes internes (jamais visibles par le candidat ni par le partenaire)
-- -----------------------------------------------------------------------------
create table public.internal_notes (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references public.candidate_profiles(id) on delete cascade,
  author_id uuid references public.profiles(id) on delete set null,
  note_type text not null default 'note' check (note_type in ('note', 'decision', 'entretien', 'verification')),
  body text not null check (char_length(body) <= 5000),
  created_at timestamptz not null default now()
);
create index internal_notes_candidate_idx on public.internal_notes (candidate_id, created_at desc);

create or replace function public.set_note_author()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null then new.author_id := auth.uid(); end if;
  return new;
end $$;
create trigger internal_notes_author before insert on public.internal_notes
  for each row execute function public.set_note_author();

-- -----------------------------------------------------------------------------
-- Journal d'audit (append-only, sans secrets)
-- -----------------------------------------------------------------------------
create table public.audit_logs (
  id bigint generated always as identity primary key,
  actor_id uuid,
  action text not null,
  entity_type text not null,
  entity_id text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index audit_logs_entity_idx on public.audit_logs (entity_type, entity_id);
create index audit_logs_created_idx on public.audit_logs (created_at desc);

create or replace function public.prevent_audit_mutation()
returns trigger language plpgsql as $$
begin
  raise exception 'Le journal d''audit est en ajout seul' using errcode = '42501';
end $$;
create trigger audit_logs_immutable before update or delete on public.audit_logs
  for each row execute function public.prevent_audit_mutation();

-- Trigger générique : enregistre les changements des tables sensibles.
-- Les colonnes volumineuses ou sensibles sont exclues des détails.
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
  values (auth.uid(), lower(tg_op), tg_table_name, coalesce(v_new ->> 'id', v_old ->> 'id', v_new ->> 'user_id', v_old ->> 'user_id'), v_changes);
  return coalesce(new, old);
end $$;

create trigger audit_user_roles after insert or update or delete on public.user_roles
  for each row execute function public.audit_row_change();
create trigger audit_profiles after update on public.profiles
  for each row execute function public.audit_row_change();
create trigger audit_candidate_profiles after update of pipeline_status, assigned_manager_id, review_flag on public.candidate_profiles
  for each row execute function public.audit_row_change();
create trigger audit_candidate_documents after insert or update or delete on public.candidate_documents
  for each row execute function public.audit_row_change();
create trigger audit_candidate_consents after insert or update on public.candidate_consents
  for each row execute function public.audit_row_change();
create trigger audit_applications after insert or update on public.applications
  for each row execute function public.audit_row_change();
create trigger audit_placements after insert or update or delete on public.placements
  for each row execute function public.audit_row_change();
create trigger audit_profile_shares after insert or update on public.profile_shares
  for each row execute function public.audit_row_change();
create trigger audit_internal_notes after insert or delete on public.internal_notes
  for each row execute function public.audit_row_change();
create trigger audit_ai_validation after update of validation_status on public.ai_analyses
  for each row execute function public.audit_row_change();
create trigger audit_skill_assessments after insert or update on public.skill_assessments
  for each row execute function public.audit_row_change();
create trigger audit_organizations after insert or update on public.organizations
  for each row execute function public.audit_row_change();
create trigger audit_partner_memberships after insert or update on public.partner_memberships
  for each row execute function public.audit_row_change();
create trigger audit_job_offers after update of status on public.job_offers
  for each row execute function public.audit_row_change();
create trigger audit_platform_settings after update on public.platform_settings
  for each row execute function public.audit_row_change();

-- ===== supabase/migrations/20261018000006_rls_policies.sql =====
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

-- ===== supabase/migrations/20261018000007_storage_reporting.sql =====
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

-- ===== supabase/migrations/20261018000008_offer_organizations_view.sql =====
-- =============================================================================
-- Migration 8 : informations minimales des organisations visibles des candidats
-- Un candidat doit connaître l'employeur d'une offre publiée, d'une offre à
-- laquelle il a postulé, ou d'une organisation avec laquelle son profil a été
-- partagé — sans accéder aux coordonnées internes (contacts, téléphones,
-- statut). La vue s'exécute avec les droits de son propriétaire et n'expose que
-- des colonnes descriptives.
-- =============================================================================
create or replace view public.offer_organizations as
  select o.id, o.name, o.sector, o.city, o.country, o.description, o.website
  from public.organizations o
  where (o.status = 'actif' and exists (select 1 from public.job_offers j where j.organization_id = o.id and j.status = 'publiee'))
     or exists (select 1 from public.applications a join public.job_offers j on j.id = a.offer_id
                where j.organization_id = o.id and a.candidate_id = public.auth_candidate_id())
     or exists (select 1 from public.profile_shares s where s.organization_id = o.id and s.candidate_id = public.auth_candidate_id());

revoke all on public.offer_organizations from anon;
grant select on public.offer_organizations to authenticated;
