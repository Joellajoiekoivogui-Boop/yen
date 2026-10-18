import "server-only";
import { createClient } from "@/lib/supabase/server";

/** Listes de sélection du formulaire d'offre. */
export async function offerFormOptions() {
  const supabase = await createClient();
  const [orgs, domains, occupations, skills] = await Promise.all([
    supabase.from("organizations").select("id, name").in("status", ["actif", "en_attente"]).order("name"),
    supabase.from("engineering_domains").select("id, name").eq("is_active", true).order("position"),
    supabase.from("occupations").select("id, title").eq("is_active", true).order("title"),
    supabase.from("skills").select("id, name").eq("is_active", true).order("name"),
  ]);
  return {
    organizations: (orgs.data ?? []).map((o) => ({ value: o.id, label: o.name })),
    domains: (domains.data ?? []).map((o) => ({ value: o.id, label: o.name })),
    occupations: (occupations.data ?? []).map((o) => ({ value: o.id, label: o.title })),
    skills: (skills.data ?? []).map((o) => ({ value: o.id, label: o.name })),
  };
}
