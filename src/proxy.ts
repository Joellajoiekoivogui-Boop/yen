import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

/**
 * Rafraîchit la session Supabase à chaque requête et redirige les visiteurs non
 * connectés hors des espaces protégés. Cette redirection est un confort
 * d'ergonomie : l'autorisation réelle est revérifiée côté serveur (layouts,
 * actions, RLS) pour chaque accès.
 */
export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};

