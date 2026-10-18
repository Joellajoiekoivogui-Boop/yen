import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

export interface OfferOrganization {
  id: string;
  name: string;
  sector: string;
  city: string | null;
  description: string;
  website: string | null;
}

/** Informations descriptives des employeurs (vue offer_organizations, sans coordonnées internes). */
export async function loadOfferOrganizations(supabase: SupabaseClient, ids: (string | null | undefined)[]): Promise<Map<string, OfferOrganization>> {
  const unique = [...new Set(ids.filter(Boolean))] as string[];
  if (!unique.length) return new Map();
  const { data } = await supabase.from("offer_organizations").select("id, name, sector, city, description, website").in("id", unique);
  return new Map((data ?? []).map((o) => [o.id, o as OfferOrganization]));
}
