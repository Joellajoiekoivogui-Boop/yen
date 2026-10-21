import Link from "next/link";
import { Briefcase, CalendarClock, CheckCircle2, ClipboardCheck, Circle, MessageSquareWarning, Sparkles, Target } from "lucide-react";
import { SingleLineChart } from "@/components/charts";
import { Alert, ApplicationStatusBadge, Badge, ButtonLink, Card, CardBody, CardHeader, EmptyState, ProgressRing, ScorePill, StatCard } from "@/components/ui";
import { requireCandidate } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { ACTIVE_APPLICATION_STATUSES } from "@/lib/labels";
import { formatDate } from "@/lib/utils";
import { completionOf, loadCandidateBundle } from "@/features/candidates/queries";
import { aggregateDemonstrated } from "@/features/candidates/skills";
import { computeMatch, rankMatches } from "@/features/matching/engine";
import { loadEvidence, loadOfferTargets } from "@/features/matching/loader";
import { loadOfferOrganizations } from "@/features/offers/organizations";
import { InfoRequestForm } from "./info-request-form";

export default async function CandidateDashboard() {
  const ctx = await requireCandidate();
  const supabase = await createClient();
  // Requêtes indépendantes lancées en parallèle : moins d'allers-retours, page plus rapide
  const [bundle, [lastAnalysis, recs, apps, offers, infoReqs]] = await Promise.all([loadCandidateBundle(supabase, ctx.candidateId), Promise.all([
    supabase.from("ai_analyses").select("created_at, status").eq("candidate_id", ctx.candidateId).in("kind", ["analyse_profil"]).neq("status", "echoue").order("created_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("ai_recommendations").select("id, rec_type, title, body, origin").eq("candidate_id", ctx.candidateId).eq("status", "active").order("priority").order("created_at", { ascending: false }).limit(4),
    supabase.from("applications").select("id, status, submitted_at, job_offers(title, organization_id)").eq("candidate_id", ctx.candidateId).in("status", ACTIVE_APPLICATION_STATUSES).order("updated_at", { ascending: false }).limit(5),
    supabase.from("job_offers").select("id").eq("status", "publiee").or(`deadline.is.null,deadline.gte.${new Date().toISOString().slice(0, 10)}`).order("published_at", { ascending: false }).limit(40),
    supabase.from("info_requests").select("id, message, created_at").eq("candidate_id", ctx.candidateId).eq("status", "ouverte"),
  ])]);
  if (!bundle) return <Alert tone="error">Profil introuvable.</Alert>;

  const [orgs, evidence, targets] = await Promise.all([
    loadOfferOrganizations(supabase, (apps.data ?? []).map((a) => (a.job_offers as unknown as { organization_id: string }).organization_id)),
    loadEvidence(supabase, ctx.candidateId, bundle.candidate.primary_domain_id),
    loadOfferTargets(supabase, (offers.data ?? []).map((o) => o.id)),
  ]);
  const completion = completionOf(bundle);
  const demonstrated = aggregateDemonstrated(bundle.skillAssessments);
  const toEvaluate = bundle.declaredSkills.filter((d) => !demonstrated[d.skill_id]);

  const topOffers = evidence ? rankMatches(targets.map((t) => ({ target: t, match: computeMatch(t, evidence) }))).slice(0, 3) : [];

  // Évolution : nombre cumulé de compétences démontrées par mois
  const firstByskill = new Map<string, string>();
  for (const s of [...bundle.skillAssessments].filter((x) => x.status === "valide").sort((a, b) => a.assessed_at.localeCompare(b.assessed_at))) {
    if (!firstByskill.has(s.skill_id)) firstByskill.set(s.skill_id, s.assessed_at.slice(0, 7));
  }
  const months = [...new Set([...firstByskill.values()])].sort();
  const evolution = months.map((m) => ({ mois: m, competences: [...firstByskill.values()].filter((x) => x <= m).length }));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-muted">Bonjour {ctx.profile.first_name || ""} 👋</p>
          <h1 className="text-2xl font-bold tracking-tight text-navy-900">Tableau de bord</h1>
          <p className="mt-1 text-xs text-muted">Identifiant YEN : <span className="font-mono font-semibold text-navy-800">{bundle.candidate.public_code}</span></p>
        </div>
        <ButtonLink href="/candidat/evaluations" variant="secondary"><ClipboardCheck className="size-4" aria-hidden /> Passer une évaluation</ButtonLink>
      </div>

      {(infoReqs.data ?? []).map((r) => (
        <Alert key={r.id} tone="warning" title="L'équipe YEN vous demande des informations complémentaires">
          <p className="mb-2">{r.message}</p>
          <InfoRequestForm id={r.id} />
        </Alert>
      ))}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card data-spotlight className="group flex items-center gap-4 p-4 transition duration-500 ease-out-expo hover:-translate-y-1 hover:shadow-lg hover:shadow-navy-900/10">
          <ProgressRing value={completion.percent} label="Complétion du profil" />
          <div className="min-w-0">
            <p className="text-xs font-medium text-muted">Complétion du profil</p>
            <p className="mt-0.5 text-sm font-semibold text-navy-900">{completion.percent >= 100 ? "Profil complet" : completion.percent >= 70 ? "Presque terminé" : "À compléter"}</p>
            <p className="mt-1 text-[11px] text-muted">Mesure le renseignement du profil, pas vos compétences.</p>
          </div>
        </Card>
        <StatCard label="Compétences démontrées" value={Object.keys(demonstrated).length} hint="Validées par une évaluation, un projet vérifié ou un évaluateur" icon={CheckCircle2} tone="gold" />
        <StatCard label="Compétences à évaluer" value={toEvaluate.length} hint="Déclarées mais pas encore démontrées" icon={Target} tone="amber" />
        <StatCard label="Dernière analyse" value={lastAnalysis.data ? formatDate(lastAnalysis.data.created_at) : "—"} hint={lastAnalysis.data ? "Analyse IA du profil" : "Aucune analyse réalisée"} icon={CalendarClock} tone="navy" />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader icon={Briefcase} title="Offres correspondant à votre profil" description="Compatibilité estimée — ce n'est pas une probabilité d'embauche." action={<Link href="/candidat/offres" className="text-sm text-electric-700 hover:underline">Toutes les offres</Link>} />
          <CardBody className="space-y-3">
            {topOffers.length === 0 ? (
              <EmptyState icon={Briefcase} title="Aucune offre publiée pour le moment" description="Les nouvelles offres pertinentes vous seront notifiées." />
            ) : (
              topOffers.map(({ target, match }) => (
                <Link key={target.id} href={`/candidat/offres/${target.id}`} className="flex items-center justify-between gap-3 rounded-lg border border-border p-3 hover:bg-slate-50">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-navy-900">{target.title}</p>
                    <p className="truncate text-xs text-muted">{match.gaps[0] ?? match.strengths[0] ?? "Voir le détail de la compatibilité"}</p>
                  </div>
                  <ScorePill score={match.score} confidence={match.confidenceLabel} />
                </Link>
              ))
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader icon={Circle} title="Pour compléter votre profil" />
          <CardBody>
            <ul className="space-y-2 text-sm">
              {completion.items.map((i) => (
                <li key={i.key} className="flex items-start gap-2">
                  {i.done ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" aria-label="Fait" /> : <Circle className="mt-0.5 size-4 shrink-0 text-slate-300" aria-label="À faire" />}
                  {i.done ? <span className="text-slate-500">{i.label}</span> : <Link href={i.href} className="text-navy-800 hover:text-electric-700 hover:underline">{i.label}</Link>}
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader icon={Sparkles} title="Principales recommandations" action={<Link href="/candidat/progression" className="text-sm text-electric-700 hover:underline">Plan</Link>} />
          <CardBody className="space-y-3">
            {(recs.data ?? []).length === 0 ? (
              <p className="text-sm text-muted">Passez une évaluation ou lancez l&apos;analyse de votre profil pour recevoir des recommandations.</p>
            ) : (
              recs.data!.map((r) => (
                <div key={r.id} className="rounded-lg bg-slate-50 p-3">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-navy-900">{r.title}</p>
                    <Badge tone={r.origin === "ia" ? "purple" : "blue"}>{r.origin === "ia" ? "IA" : "Évaluation"}</Badge>
                  </div>
                  <p className="mt-1 line-clamp-3 text-xs text-slate-600">{r.body}</p>
                </div>
              ))
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader icon={MessageSquareWarning} title="Candidatures en cours" action={<Link href="/candidat/candidatures" className="text-sm text-electric-700 hover:underline">Suivi</Link>} />
          <CardBody className="space-y-2">
            {(apps.data ?? []).length === 0 ? (
              <p className="text-sm text-muted">Aucune candidature en cours.</p>
            ) : (
              apps.data!.map((a) => {
                const o = a.job_offers as unknown as { title: string; organization_id: string };
                return (
                  <div key={a.id} className="flex items-start justify-between gap-2 border-b border-border pb-2 last:border-0">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-navy-900">{o.title}</p>
                      <p className="text-xs text-muted">{orgs.get(o.organization_id)?.name}</p>
                    </div>
                    <ApplicationStatusBadge status={a.status} />
                  </div>
                );
              })
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Évolution de vos compétences" description="Compétences démontrées cumulées" />
          <CardBody>
            {evolution.length === 0 ? <p className="text-sm text-muted">Votre progression apparaîtra après votre première évaluation réussie.</p> : <SingleLineChart data={evolution} xKey="mois" yKey="competences" label="Compétences démontrées" height={180} />}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
