import { NextResponse, type NextRequest } from "next/server";
import { isGoogleAuthEnabled } from "@/lib/auth/oauth";
import { publicEnv } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { safeInternalPath } from "@/lib/utils";

/**
 * Démarre la connexion avec Google côté serveur : Supabase prépare l'adresse d'autorisation
 * et dépose le vérificateur PKCE dans un cookie httpOnly ; le navigateur part ensuite vers
 * Google. Aucune clé ni client Supabase n'est chargé dans le navigateur.
 * `suivant` : page interne où revenir après la connexion (jamais un autre site).
 */
export async function GET(request: NextRequest) {
  const fail = (code: string) => NextResponse.redirect(new URL(`/connexion?erreur=${code}`, request.nextUrl.origin), { status: 303 });
  if (!(await isGoogleAuthEnabled())) return fail("google_indisponible");

  const callback = new URL("/auth/callback", publicEnv.siteUrl);
  callback.searchParams.set("fournisseur", "google");
  // le bouton affiche les conditions d'utilisation : leur acceptation est enregistrée au retour
  if (request.nextUrl.searchParams.get("cgu") === "1") callback.searchParams.set("cgu", "1");
  const next = safeInternalPath(request.nextUrl.searchParams.get("suivant"));
  if (next) callback.searchParams.set("suivant", next);

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: callback.toString(),
      skipBrowserRedirect: true,
      // choix du compte Google à chaque connexion (ordinateur partagé, plusieurs comptes)
      queryParams: { prompt: "select_account" },
    },
  });
  if (error || !data?.url) {
    console.error("[google] démarrage refusé", error?.code ?? error?.name);
    return fail("google");
  }
  return NextResponse.redirect(data.url, { status: 303 });
}
