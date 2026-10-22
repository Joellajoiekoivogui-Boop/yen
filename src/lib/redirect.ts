import { NextResponse } from "next/server";

/**
 * Redirection vers une page du site par un chemin relatif : le navigateur le résout sur le
 * domaine qu'il utilise réellement. Une adresse absolue construite côté serveur peut reprendre
 * l'adresse d'écoute interne (ex. 0.0.0.0) et faire perdre les cookies de session au passage.
 * Seuls les chemins internes sont acceptés (jamais un autre site).
 */
export function redirectToPath(path: string, status: 303 | 307 = 307) {
  const safe = path.startsWith("/") && !path.startsWith("//") && !path.startsWith("/\\") ? path : "/";
  return new NextResponse(null, { status, headers: { Location: safe } });
}
