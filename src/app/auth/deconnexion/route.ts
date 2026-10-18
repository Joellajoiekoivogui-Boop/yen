import { NextResponse, type NextRequest } from "next/server";
import { isSupabaseConfigured } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  // Protection CSRF : la requête doit provenir du même site
  const origin = request.headers.get("origin");
  if (origin && origin !== request.nextUrl.origin) {
    return new NextResponse("Origine non autorisée", { status: 403 });
  }
  if (isSupabaseConfigured()) {
    const supabase = await createClient();
    await supabase.auth.signOut();
  }
  return NextResponse.redirect(new URL("/", request.url), { status: 303 });
}
