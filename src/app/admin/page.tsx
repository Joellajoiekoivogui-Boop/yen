import type { Metadata } from "next";
import Link from "next/link";
import { Briefcase, ClipboardCheck, FileText, GraduationCap, Send, Trophy, UserCheck, Users } from "lucide-react";
import { SimpleBarChart } from "@/components/charts";
import { Alert, Card, CardBody, CardHeader, PageHeader, StatCard } from "@/components/ui";
import { requireStaff } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { pipelineLabel, type PipelineStatus } from "@/lib/labels";
import { formatPercent, param } from "@/lib/utils";
import { getInsertionWindowMonths } from "@/features/admin/settings";

export const metadata: Metadata = { title: "Vue générale" };

export default async function AdminHome(props: PageProps<"/admin">) {
  const sp = await props.searchParams;
  const ctx = await requireStaff();
  const includeDemo = param(sp.demo) === "1";
  if (!ctx.permissions.has("reports.view") && !ctx.permissions.has("candidates.read")) {
    return (
      <div>
        <PageHeader title="Administration YEN" description="Utilisez le menu pour accéder aux modules autorisés pour votre rôle." />
      </div>
    );
  }
  const supabase = await createClient();
  const months = await getInsertionWindowMonths();
  const end = new Date();
  const start = new Date(end);
  start.setMonth(start.getMonth() - months);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const [{ data: stats, error }, report] = await Promise.all([
    supabase.rpc("admin_overview_stats", { p_include_demo: includeDemo }),
    ctx.permissions.has("reports.view") ? supabase.rpc("insertion_report", { p_start: iso(start), p_end: iso(end), p_include_demo: includeDemo }) : Promise.resolve({ data: null }),
  ]);
  if (error || !stats) return <Alert tone="error">Les statistiques n&apos;ont pas pu être chargées.</Alert>;
  const s = stats as Record<string, number | boolean | unknown[] | Record<string, number>>;
  const r = report.data as { insertion_rate: number | null; denominator: number; placed_confirmed: number; denominator_definition: string } | null;
  const skills = (s.skills_by_domain as { domain: string; demonstrated: number; candidates: number }[]).slice(0, 10);
  const pipeline = Object.entries(s.pipeline as Record<string, number>).map(([k, v]) => ({ statut: pipelineLabel[k as PipelineStatus] ?? k, candidats: v }));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Vue générale"
        description="Données réelles de la plateforme."
        actions={<Link href={includeDemo ? "/admin" : "/admin?demo=1"} className="text-sm text-electric-700 hover:underline">{includeDemo ? "Exclure les données de démonstration" : "Inclure les données de démonstration"}</Link>}
      />
      {includeDemo && <Alert tone="warning" title="Données de démonstration incluses">Les chiffres ci-dessous incluent {String(s.demo_candidates)} candidat(s) fictif(s) de démonstration.</Alert>}
      {!includeDemo && Number(s.demo_candidates) > 0 && <Alert tone="info">{String(s.demo_candidates)} candidat(s) de démonstration sont exclus de ces statistiques.</Alert>}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Candidats inscrits" value={Number(s.candidates_total)} icon={Users} />
        <StatCard label="Profils complétés" value={Number(s.profiles_completed)} hint="Titre, résumé, domaine, compétences et formation renseignés" icon={UserCheck} tone="teal" />
        <StatCard label="CV disponibles" value={Number(s.cv_available)} icon={FileText} tone="navy" />
        <StatCard label="Évaluations terminées" value={Number(s.assessments_completed)} hint={`${Number(s.pending_reviews)} en attente de correction`} icon={ClipboardCheck} tone="amber" />
        <StatCard label="Prêts pour la présélection" value={Number(s.ready_for_shortlist)} icon={GraduationCap} tone="teal" />
        <StatCard label="Offres actives" value={Number(s.offers_active)} icon={Briefcase} />
        <StatCard label="Candidatures en cours" value={Number(s.applications_in_progress)} icon={Send} tone="navy" />
        <StatCard label="Stages / emplois confirmés" value={`${Number(s.internships_confirmed)} / ${Number(s.jobs_confirmed)}`} hint={`${Number(s.placements_declared_unconfirmed)} placement(s) déclaré(s) non confirmé(s)`} icon={Trophy} tone="amber" />
      </div>

      {r && (
        <Card>
          <CardHeader title={`Taux d'insertion — ${months} derniers mois`} action={<Link href="/admin/rapports" className="text-sm text-electric-700 hover:underline">Rapport détaillé</Link>} />
          <CardBody>
            <p className="text-3xl font-bold text-navy-900 tabular-nums">{r.insertion_rate == null ? "—" : formatPercent(r.insertion_rate, 1)}</p>
            <p className="mt-1 text-sm text-slate-600">{r.placed_confirmed} candidat(s) avec un placement confirmé / {r.denominator} candidat(s) éligibles.</p>
            <p className="mt-1 text-xs text-muted">Dénominateur : {r.denominator_definition}. Seuls les placements confirmés sont comptés.</p>
          </CardBody>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Compétences démontrées par domaine" />
          <CardBody>{skills.length ? <SimpleBarChart data={skills} xKey="domain" series={[{ key: "demonstrated", label: "Compétences démontrées" }]} label="Compétences démontrées par domaine" layout="vertical" height={Math.max(180, skills.length * 34)} /> : <p className="text-sm text-muted">Aucune compétence démontrée pour l&apos;instant.</p>}</CardBody>
        </Card>
        <Card>
          <CardHeader title="Pipeline d'insertion" />
          <CardBody>{pipeline.length ? <SimpleBarChart data={pipeline} xKey="statut" series={[{ key: "candidats", label: "Candidats" }]} label="Candidats par statut" layout="vertical" height={Math.max(180, pipeline.length * 34)} /> : <p className="text-sm text-muted">Aucun candidat.</p>}</CardBody>
        </Card>
      </div>
    </div>
  );
}
