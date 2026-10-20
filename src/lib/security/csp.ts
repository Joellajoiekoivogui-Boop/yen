import { publicEnv } from "@/lib/env";

const storageOrigin = (() => {
  try {
    return publicEnv.supabaseUrl ? new URL(publicEnv.supabaseUrl).origin : "";
  } catch {
    return "";
  }
})();
const isDev = process.env.NODE_ENV !== "production";
const isHttps = publicEnv.siteUrl.startsWith("https://");

/**
 * Politique de sécurité du contenu, générée à chaque requête par proxy.ts :
 *  - scripts : uniquement ceux de l'application, porteurs du nonce de la page
 *    ('strict-dynamic' autorise les modules qu'ils chargent) ; aucun script en ligne injecté ne s'exécute ;
 *  - aucune ressource externe, sauf les aperçus de documents des espaces connectés
 *    (URL signée du stockage privé, valable 60 secondes) ;
 *  - ni cadre, ni plugin, ni envoi de formulaire vers un autre site.
 */
export function contentSecurityPolicy(nonce: string, pathname: string): string {
  const appSpace = /^\/(candidat|admin|partenaire)(\/|$)/.test(pathname);
  const documents = appSpace && storageOrigin ? ` ${storageOrigin}` : "";
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data: blob:${documents}`,
    "font-src 'self' data:",
    `connect-src 'self'${isDev ? " ws:" : ""}`,
    "media-src 'self'",
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "frame-src 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(isHttps ? ["upgrade-insecure-requests"] : []),
  ].join("; ");
}
