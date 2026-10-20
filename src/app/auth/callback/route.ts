import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { safeInternalPath } from "@/lib/utils";

/**
 * Point de retour des liens e-mail Supabase (confirmation d'inscription,
 * réinitialisation du mot de passe). Supporte le flux PKCE (`code`) et le flux
 * `token_hash` des modèles d'e-mail.
 */
export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const next = url.searchParams.get("suivant");
  const safeNext = safeInternalPath(next) ?? "/connexion?confirme=1";
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
  const target = new URL(ok ? safeNext : "/connexion?erreur=lien", url.origin);
  return NextResponse.redirect(target);
}
