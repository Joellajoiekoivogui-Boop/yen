import { NextResponse, type NextRequest } from "next/server";
import { logAudit } from "@/lib/action";
import { getSession } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { isUuid } from "@/lib/utils";

const CV_BUCKET = "candidate-documents";

/**
 * Téléchargement d'un document privé : vérifie l'accès (propriétaire ou
 * personnel avec documents.read, via RLS) puis redirige vers une URL signée
 * valable 60 secondes. Aucune URL publique permanente n'existe.
 */
export async function GET(_req: NextRequest, ctx: RouteContext<"/api/documents/[id]">) {
  const { id } = await ctx.params;
  if (!isUuid(id)) return new NextResponse("Document introuvable", { status: 404 });
  const session = await getSession();
  if (!session) return new NextResponse("Authentification requise", { status: 401 });

  const supabase = await createClient();
  const { data: doc } = await supabase
    .from("candidate_documents")
    .select("id, storage_path, candidate_id, original_filename")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (!doc) return new NextResponse("Document introuvable", { status: 404 });

  const { data, error } = await supabase.storage.from(CV_BUCKET).createSignedUrl(doc.storage_path, 60, { download: doc.original_filename });
  if (error || !data) return new NextResponse("Lien indisponible", { status: 403 });

  if (doc.candidate_id !== session.candidateId) {
    await logAudit(session.userId, "document_downloaded", "candidate_documents", doc.id, { candidate_id: doc.candidate_id });
  }
  return NextResponse.redirect(data.signedUrl, { headers: { "Cache-Control": "no-store" } });
}
