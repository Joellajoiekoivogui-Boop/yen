import { NextResponse, type NextRequest } from "next/server";
import { isSupabaseConfigured } from "@/lib/env";
import { redirectToPath } from "@/lib/redirect";
import { createClient } from "@/lib/supabase/server";

/**
 * Protection CSRF : la déconnexion doit venir d'une page du site. L'origine annoncée par le
 * navigateur est comparée à l'hôte effectivement demandé (et non à l'adresse d'écoute du
 * serveur, différente derrière un proxy) ; ce que le navigateur signale comme venant d'un
 * autre site est refusé.
 */
function isSameOrigin(request: NextRequest): boolean {
  const site = request.headers.get("sec-fetch-site");
  if (site && site !== "same-origin" && site !== "none") return false;
  const origin = request.headers.get("origin");
  if (!origin) return true;
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  try {
    return Boolean(host) && new URL(origin).host === host;
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) {
    return new NextResponse("Origine non autorisée", { status: 403 });
  }
  if (isSupabaseConfigured()) {
    const supabase = await createClient();
    await supabase.auth.signOut();
  }
  return redirectToPath("/", 303);
}
