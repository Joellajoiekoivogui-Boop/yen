import { NextResponse } from "next/server";
import { logAudit } from "@/lib/action";
import { getSession } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { loadCandidateBundle } from "@/features/candidates/queries";

/**
 * Export complet des données du candidat (portabilité). Les notes internes de
 * YEN et les clés de correction des évaluations n'en font pas partie.
 */
export async function GET() {
  const session = await getSession();
  if (!session?.candidateId) return new NextResponse("Accès refusé", { status: 403 });
  const supabase = await createClient();
  const bundle = await loadCandidateBundle(supabase, session.candidateId);
  if (!bundle) return new NextResponse("Profil introuvable", { status: 404 });
  const [applications, attempts, documents, analyses, recommendations, placements] = await Promise.all([
    supabase.from("applications").select("id, status, origin, motivation, submitted_at, decided_at, job_offers(title, organizations(name)), application_events(from_status, to_status, note, created_at)").eq("candidate_id", session.candidateId),
    supabase.from("assessment_attempts").select("id, status, started_at, submitted_at, graded_at, score_percent, passed, result_details, recommendations, assessments(title)").eq("candidate_id", session.candidateId),
    supabase.from("candidate_documents").select("id, kind, original_filename, size_bytes, version, is_current, created_at, deleted_at").eq("candidate_id", session.candidateId),
    supabase.from("ai_analyses").select("id, kind, provider, model, status, output, validation_status, created_at").eq("candidate_id", session.candidateId),
    supabase.from("ai_recommendations").select("rec_type, title, body, status, origin, created_at").eq("candidate_id", session.candidateId),
    supabase.from("placements").select("organization_name, position_title, placement_type, contract_type, start_date, end_date, confirmation_status").eq("candidate_id", session.candidateId),
  ]);
  await logAudit(session.userId, "profile_exported", "candidate_profiles", session.candidateId);
  const payload = {
    exported_at: new Date().toISOString(),
    platform: "YEN Career Bridge",
    ...bundle,
    applications: applications.data ?? [],
    assessment_attempts: attempts.data ?? [],
    documents: documents.data ?? [],
    ai_analyses: analyses.data ?? [],
    recommendations: recommendations.data ?? [],
    placements: placements.data ?? [],
  };
  return new NextResponse(JSON.stringify(payload, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="mes-donnees-${bundle.candidate.public_code}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
