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
