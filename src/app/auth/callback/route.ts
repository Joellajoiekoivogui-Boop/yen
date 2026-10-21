import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { getSession, homePathFor } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { safeInternalPath } from "@/lib/utils";

/**
 * Point de retour de Supabase Auth :
 *  - liens e-mail (confirmation d'inscription, réinitialisation du mot de passe), flux PKCE
 *    (`code`) ou `token_hash` des modèles d'e-mail ;
 *  - connexion avec Google (`fournisseur=google`), démarrée par /auth/google.
 * Les redirections restent toujours internes au site (safeInternalPath).
 */
export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const google = url.searchParams.get("fournisseur") === "google";
  const next = safeInternalPath(url.searchParams.get("suivant"));
  const redirect = (path: string) => NextResponse.redirect(new URL(path, url.origin));

  // Connexion Google annulée ou refusée (le code d'erreur seul, jamais le détail technique)
  const oauthError = url.searchParams.get("error");
  if (oauthError) {
    if (google) console.error("[google] retour en erreur", oauthError);
    return redirect(google ? `/connexion?erreur=${oauthError === "access_denied" ? "google_annule" : "google"}` : "/connexion?erreur=lien");
  }

  const supabase = await createClient();
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as EmailOtpType | null;

  let ok = false;
  if (code) {
    ok = !(await supabase.auth.exchangeCodeForSession(code)).error;
  } else if (tokenHash && type) {
    ok = !(await supabase.auth.verifyOtp({ type, token_hash: tokenHash })).error;
  }
  if (!google) return redirect(ok ? (next ?? "/connexion?confirme=1") : "/connexion?erreur=lien");
  if (!ok) return redirect("/connexion?erreur=google");

  const ctx = await getSession();
  if (!ctx) return redirect("/connexion?erreur=google");
  if (!ctx.profile.is_active) {
    await supabase.auth.signOut();
    return redirect("/compte-desactive");
  }
  await completeGoogleProfile(supabase, ctx, url.searchParams.get("cgu") === "1");
  return redirect(next ?? homePathFor(ctx));
}

/**
 * Premier passage avec Google : prénom et nom repris du compte Google s'ils manquent, et
 * acceptation des conditions d'utilisation (affichées sous le bouton) enregistrée pour un
 * nouveau candidat. Le téléphone, obligatoire, est demandé ensuite dans « Mon profil ».
 */
async function completeGoogleProfile(
  supabase: Awaited<ReturnType<typeof createClient>>,
  ctx: NonNullable<Awaited<ReturnType<typeof getSession>>>,
  acceptedTerms: boolean,
) {
  try {
    if (!ctx.profile.first_name.trim() && !ctx.profile.last_name.trim()) {
      const { data } = await supabase.auth.getUser();
      const meta = (data.user?.user_metadata ?? {}) as Record<string, unknown>;
      const full = String(meta.full_name ?? meta.name ?? "").trim().replace(/\s+/g, " ");
      if (full) {
        const [first, ...rest] = full.split(" ");
        await supabase.from("profiles").update({ first_name: first.slice(0, 100), last_name: rest.join(" ").slice(0, 100) }).eq("id", ctx.userId);
      }
    }
    if (acceptedTerms && ctx.candidateId) {
      const { count } = await supabase
        .from("candidate_consents")
        .select("id", { count: "exact", head: true })
        .eq("candidate_id", ctx.candidateId)
        .eq("consent_type", "conditions_utilisation");
      if (!count) await supabase.from("candidate_consents").insert({ candidate_id: ctx.candidateId, consent_type: "conditions_utilisation", granted: true });
    }
  } catch (e) {
    console.error("[google] profil non complété", e instanceof Error ? e.name : "erreur");
  }
}
