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
