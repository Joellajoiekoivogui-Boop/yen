-- YEN Career Bridge — À coller dans Supabase > SQL Editor > Run (une seule fois) : téléphone obligatoire pour les candidats.
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
