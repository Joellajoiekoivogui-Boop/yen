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
