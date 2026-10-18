import "server-only";
import { createClient } from "@/lib/supabase/server";

export async function partnerOfferOptions() {
  const supabase = await createClient();
  const [domains, occupations, skills] = await Promise.all([
    supabase.from("engineering_domains").select("id, name").eq("is_active", true).order("position"),
    supabase.from("occupations").select("id, title").eq("is_active", true).order("title"),
    supabase.from("skills").select("id, name").eq("is_active", true).order("name"),
  ]);
  return {
    organizations: [],
    domains: (domains.data ?? []).map((o) => ({ value: o.id, label: o.name })),
    occupations: (occupations.data ?? []).map((o) => ({ value: o.id, label: o.title })),
    skills: (skills.data ?? []).map((o) => ({ value: o.id, label: o.name })),
  };
}
