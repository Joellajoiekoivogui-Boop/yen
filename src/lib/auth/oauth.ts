import "server-only";
import { isSupabaseConfigured, publicEnv } from "@/lib/env";

/**
 * Vrai si le fournisseur Google est activé dans Supabase (Authentication › Sign In / Providers).
 * Lu sur le point public /auth/v1/settings, mis en cache 5 minutes : le bouton « Continuer avec
 * Google » n'apparaît qu'une fois le fournisseur configuré, jamais vers une page d'erreur.
 */
export async function isGoogleAuthEnabled(): Promise<boolean> {
  if (!isSupabaseConfigured()) return false;
  try {
    const res = await fetch(`${publicEnv.supabaseUrl}/auth/v1/settings`, {
      headers: { apikey: publicEnv.supabaseAnonKey },
      next: { revalidate: 300 },
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return false;
    const settings = (await res.json()) as { external?: Record<string, boolean> };
    return settings.external?.google === true;
  } catch {
    return false;
  }
}
