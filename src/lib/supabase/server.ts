import "server-only";
import { createServerClient } from "@supabase/ssr";
import { createClient as createSupabaseClient, type SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { publicEnv, serverEnv } from "@/lib/env";

/**
 * Client Supabase lié à la session de l'utilisateur (cookies). Toutes les
 * requêtes passent par les politiques RLS avec l'identité de l'utilisateur.
 */
export async function createClient(): Promise<SupabaseClient> {
  const cookieStore = await cookies();
  return createServerClient(publicEnv.supabaseUrl, publicEnv.supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Appelé depuis un Server Component : le rafraîchissement est géré par proxy.ts
        }
      },
    },
  });
}

/**
 * Client « service » qui contourne RLS. À utiliser UNIQUEMENT côté serveur, dans
 * des fonctions métier étroites, APRÈS une vérification explicite des droits
 * (ex. distribution des questions sans clés de correction, écriture d'un
 * résultat de correction, vue restreinte pour un partenaire).
 */
export function createAdminClient(): SupabaseClient {
  const key = serverEnv().supabaseServiceKey;
  if (!key) {
    throw new Error("SUPABASE_SECRET_KEY (ou SUPABASE_SERVICE_ROLE_KEY) n'est pas configurée côté serveur.");
  }
  return createSupabaseClient(publicEnv.supabaseUrl, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
