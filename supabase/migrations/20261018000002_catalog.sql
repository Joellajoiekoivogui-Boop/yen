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
