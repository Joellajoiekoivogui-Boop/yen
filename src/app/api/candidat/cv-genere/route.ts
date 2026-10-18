import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { loadCandidateBundle } from "@/features/candidates/queries";
import { generateCvPdf } from "@/features/cv/generate";

/** CV PDF généré à partir des données validées du profil du candidat connecté. */
export async function GET() {
  const session = await getSession();
  if (!session?.candidateId) return new NextResponse("Accès refusé", { status: 403 });
  const supabase = await createClient();
  const bundle = await loadCandidateBundle(supabase, session.candidateId);
  if (!bundle) return new NextResponse("Profil introuvable", { status: 404 });
  const pdf = await generateCvPdf(bundle, { includeContact: true });
  return new NextResponse(Buffer.from(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="cv-${bundle.candidate.public_code}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
