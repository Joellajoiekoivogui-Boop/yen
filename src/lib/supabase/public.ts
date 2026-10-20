import "server-only";
import { createClient as createSupabaseClient, type SupabaseClient } from "@supabase/supabase-js";
import { publicEnv } from "@/lib/env";

/**
 * Client anonyme sans cookies, pour les données publiques (catalogue, partenaires
 * publiés). Utilisable dans les pages statiques régénérées périodiquement.
 */
export function createPublicClient(): SupabaseClient {
  return createSupabaseClient(publicEnv.supabaseUrl, publicEnv.supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
