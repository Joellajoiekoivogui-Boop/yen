import { NextResponse, type NextRequest } from "next/server";
import { logAudit } from "@/lib/action";
import { getSession } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { availabilityLabel, pipelineLabel, type Availability, type PipelineStatus } from "@/lib/labels";
import { searchTalents } from "@/features/admin/talents";
import { toCsv } from "@/features/reporting/export";

/**
 * Export CSV du répertoire filtré. Données limitées au strict nécessaire
 * (pas d'e-mail ni de téléphone) ; permission reports.export + candidates.read ; journalisé.
 */
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session?.permissions.has("reports.export") || !session.permissions.has("candidates.read")) return new NextResponse("Accès refusé", { status: 403 });
  const sp = req.nextUrl.searchParams;
  const supabase = await createClient();
  const all = [];
  for (let page = 1; page <= 20; page++) {
    const { rows } = await searchTalents(supabase, {
      q: sp.get("q") ?? undefined, domain: sp.get("domaine") ?? undefined, skill: sp.get("competence") ?? undefined,
      program: sp.get("formation") ?? undefined, city: sp.get("ville") ?? undefined, availability: sp.get("disponibilite") ?? undefined,
      opportunity: sp.get("opportunite") ?? undefined, pipeline: sp.get("statut") ?? undefined, includeDemo: sp.get("demo") === "1",
      page, pageSize: 100,
    });
    all.push(...rows);
    if (rows.length < 100) break;
  }
  await logAudit(session.userId, "talents_exported", "candidate_profiles", null, { count: all.length, filters: Object.fromEntries(sp) });
  const csv = toCsv(
    ["Identifiant YEN", "Nom", "Ville", "Formation YEN", "Domaine", "Année", "Compétences évaluées", "Projets", "Complétion (%)", "Disponibilité", "Métier recommandé", "Score", "Statut", "Démo"],
    all.map((r) => [r.public_code, r.name, r.city, r.yen_program, r.domain, r.graduation_year, r.evaluatedSkills, r.projects, r.completion, availabilityLabel[r.availability as Availability], r.bestOccupation?.title, r.bestOccupation?.score, pipelineLabel[r.pipeline_status as PipelineStatus], r.is_demo ? "oui" : "non"]),
  );
  return new NextResponse(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="talents-yen-${new Date().toISOString().slice(0, 10)}.csv"`, "Cache-Control": "no-store" } });
}
