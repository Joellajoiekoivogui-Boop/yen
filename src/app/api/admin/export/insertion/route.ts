import { NextResponse, type NextRequest } from "next/server";
import { logAudit } from "@/lib/action";
import { getSession } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { fullName } from "@/lib/utils";
import { insertionReportPdf, toCsv, type InsertionReport } from "@/features/reporting/export";

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Export du rapport d'insertion (CSV ou PDF) — permission reports.export, accès journalisé. */
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session?.permissions.has("reports.export") || !session.permissions.has("reports.view")) return new NextResponse("Accès refusé", { status: 403 });
  const sp = req.nextUrl.searchParams;
  const start = sp.get("debut") ?? "";
  const end = sp.get("fin") ?? "";
  if (!DATE.test(start) || !DATE.test(end)) return new NextResponse("Période invalide", { status: 400 });
  const includeDemo = sp.get("demo") === "1";
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("insertion_report", { p_start: start, p_end: end, p_include_demo: includeDemo });
  if (error || !data) return new NextResponse("Rapport indisponible", { status: 500 });
  const r = data as InsertionReport;
  const format = sp.get("format") === "pdf" ? "pdf" : "csv";
  await logAudit(session.userId, "report_exported", "insertion_report", null, { start, end, format, include_demo: includeDemo });
  const name = `rapport-insertion-${start}-${end}`;
  if (format === "pdf") {
    const pdf = await insertionReportPdf(r, fullName(session.profile));
    return new NextResponse(Buffer.from(pdf), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${name}.pdf"`, "Cache-Control": "no-store" } });
  }
  const csv = toCsv(["Indicateur", "Valeur"], [
    ["Début de période", r.period_start], ["Fin de période", r.period_end],
    ["Définition du dénominateur", r.denominator_definition], ["Dénominateur", r.denominator],
    ["Candidats avec placement confirmé", r.placed_confirmed], ["Taux d'insertion (%)", r.insertion_rate ?? "non calculable"],
    ["Stages confirmés", r.internships_confirmed], ["Emplois confirmés", r.jobs_confirmed],
    ["Placements déclarés non confirmés", r.placements_declared_unconfirmed], ["Candidatures en cours", r.applications_in_progress],
    ["Données de démonstration incluses", r.demo_data_included ? "oui" : "non"],
    ...r.by_month.map((m) => [`Mois ${m.month}`, `${m.stages} stage(s) / ${m.emplois} emploi(s)`]),
    ...r.by_domain.map((d) => [`Domaine : ${d.domain}`, d.placed]),
  ]);
  return new NextResponse(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${name}.csv"`, "Cache-Control": "no-store" } });
}
