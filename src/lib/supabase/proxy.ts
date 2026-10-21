import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isSupabaseConfigured, publicEnv } from "@/lib/env";
import { contentSecurityPolicy } from "@/lib/security/csp";
import { AUTH_COOKIE_OPTIONS } from "./cookies";

const PROTECTED_PREFIXES = ["/candidat", "/admin", "/partenaire"];

/**
 * À chaque requête : nonce et politique de sécurité du contenu, rafraîchissement
 * de la session Supabase, et redirection des visiteurs non connectés hors des
 * espaces protégés (confort d'ergonomie : l'autorisation réelle est revérifiée
 * côté serveur et en base pour chaque accès).
 */
export async function updateSession(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const isProtected = PROTECTED_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`));
  const nonce = btoa(crypto.randomUUID());
  // Cookie de session présent (vérifié plus bas) : droits d'aperçu et d'envoi de fichiers dès la première page
  const hasSession = request.cookies.getAll().some((c) => c.name.startsWith("sb-") && c.name.includes("-auth-token"));
  const csp = contentSecurityPolicy(nonce, path, hasSession);

  // Next.js lit le nonce dans l'en-tête CSP de la requête et l'applique à ses scripts
  const forward = () => {
    const headers = new Headers(request.headers);
    headers.set("x-nonce", nonce);
    headers.set("content-security-policy", csp);
    const res = NextResponse.next({ request: { headers } });
    res.headers.set("Content-Security-Policy", csp);
    return res;
  };
  const redirectTo = (pathname: string, params: Record<string, string> = {}) => {
    const url = request.nextUrl.clone();
    url.pathname = pathname;
    url.search = "";
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    const res = NextResponse.redirect(url);
    res.headers.set("Content-Security-Policy", csp);
    return res;
  };

  if (!isSupabaseConfigured()) return isProtected ? redirectTo("/connexion", { config: "manquante" }) : forward();

  // Visiteur sans cookie de session : rien à rafraîchir ni à vérifier
  if (!hasSession) return isProtected ? redirectTo("/connexion", { suivant: path }) : forward();

  let response = forward();
  const supabase = createServerClient(publicEnv.supabaseUrl, publicEnv.supabaseAnonKey, {
    cookieOptions: AUTH_COOKIE_OPTIONS,
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = forward();
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  // getSession() lit la session dans les cookies et ne contacte Supabase Auth que pour
  // rafraîchir un jeton sur le point d'expirer : aucun aller-retour réseau à chaque clic.
  // Elle ne vérifie pas la signature : cette redirection n'est qu'un confort, l'identité est
  // vérifiée dans chaque page et action (getClaims) et par la base (RLS) à chaque requête.
  let signedIn = false;
  try {
    const { data } = await supabase.auth.getSession();
    signedIn = Boolean(data?.session?.access_token);
  } catch {
    signedIn = false;
  }

  if (!signedIn && isProtected) return redirectTo("/connexion", { suivant: path });
  return response;
}
