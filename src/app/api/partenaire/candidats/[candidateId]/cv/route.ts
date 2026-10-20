import { NextResponse, type NextRequest } from "next/server";
import { logAudit } from "@/lib/action";
import { getSession } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { isUuid } from "@/lib/utils";

/**
 * CV d'un candidat pour un partenaire : autorisé uniquement si le candidat a
 * postulé à une offre de l'organisation ou si son profil a été partagé (avec
 * CV) et que le consentement est toujours valide. Vérification via la fonction
 * SQL partner_can_view_cv exécutée avec l'identité du partenaire.
 */
export async function GET(_req: NextRequest, ctx: RouteContext<"/api/partenaire/candidats/[candidateId]/cv">) {
  const { candidateId } = await ctx.params;
  if (!isUuid(candidateId)) return new NextResponse("Introuvable", { status: 404 });
  const session = await getSession();
  if (!session || session.partnerOrganizationIds.length === 0) return new NextResponse("Accès refusé", { status: 403 });

  const supabase = await createClient();
  const { data: allowed } = await supabase.rpc("partner_can_view_cv", { p_candidate: candidateId });
  if (allowed !== true) return new NextResponse("Accès refusé", { status: 403 });

  // partner_cv_document et la politique de stockage n'autorisent que le CV courant d'un candidat visible
  const { data: rows } = await supabase.rpc("partner_cv_document", { p_candidate: candidateId });
  const doc = ((rows ?? []) as { id: string; storage_path: string }[])[0];
  if (!doc) return new NextResponse("Aucun CV disponible", { status: 404 });
  const { data } = await supabase.storage.from("candidate-documents").createSignedUrl(doc.storage_path, 60, { download: "cv-candidat.pdf" });
  if (!data) return new NextResponse("Lien indisponible", { status: 500 });
  await logAudit(session.userId, "partner_cv_downloaded", "candidate_documents", doc.id, { candidate_id: candidateId, organization_id: session.partnerOrganizationIds[0] });
  return NextResponse.redirect(data.signedUrl, { headers: { "Cache-Control": "no-store" } });
}
