import type { Metadata } from "next";
import { Route, Sparkles, Target } from "lucide-react";
import { ActionButton } from "@/components/forms/action-button";
import { Alert, Badge, Card, CardBody, CardHeader, EmptyState, PageHeader } from "@/components/ui";
import { requireCandidate } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime } from "@/lib/utils";
import { levelLabel } from "@/lib/labels";
import { generateProgressPlanAction } from "@/features/ai/actions";
import { setRecommendationStatusAction } from "@/features/candidates/actions";
import { isAIConfigured } from "@/features/ai/provider";
import type { ProgressPlan } from "@/features/ai/schemas";
import { gapAnalysis } from "@/features/ai/services";

export const metadata: Metadata = { title: "Mon plan de progression" };

export default async function ProgressPage() {
  const ctx = await requireCandidate();
  const supabase = await createClient();
  const { data: cand } = await supabase.from("candidate_profiles").select("primary_domain_id").eq("id", ctx.candidateId).single();
  const [{ gaps, matches }, plan, recs, consent] = await Promise.all([
    gapAnalysis(supabase, ctx.candidateId, cand?.primary_domain_id ?? null),
    supabase.from("ai_analyses").select("id, status, output, error, created_at, model").eq("candidate_id", ctx.candidateId).eq("kind", "plan_progression").order("created_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("ai_recommendations").select("id, rec_type, title, body, origin, status, created_at").eq("candidate_id", ctx.candidateId).neq("status", "ignoree").order("created_at", { ascending: false }).limit(30),
    supabase.from("candidate_consents").select("granted").eq("candidate_id", ctx.candidateId).eq("consent_type", "traitement_ia").maybeSingle(),
  ]);
  const p = plan.data?.status !== "echoue" ? (plan.data?.output as ProgressPlan | null) : null;
  const uniqueGaps = [...new Map(gaps.map((g) => [g.skillId, g])).values()];

  return (
    <div className="space-y-6">
      <PageHeader title="Mon plan de progression" description="Les écarts sont calculés à partir des métiers les plus compatibles avec votre profil." />
      <Card>
        <CardHeader icon={Target} title="Compétences à renforcer" description={matches.length ? `Métiers visés : ${matches.map((m) => `${m.target.title} (${m.match.score}/100)`).join(" · ")}` : undefined} />
        <CardBody>
          {uniqueGaps.length === 0 ? <p className="text-sm text-muted">Aucun écart identifié pour l&apos;instant (ou domaine principal non renseigné).</p> : (
            <ul className="grid grid-cols-1 gap-2 md:grid-cols-2">
              {uniqueGaps.map((g) => (
                <li key={g.skillId} className="rounded-lg border border-border p-3 text-sm">
                  <p className="font-medium text-navy-900">{g.skillName}</p>
                  <p className="text-xs text-muted">{levelLabel[g.requiredLevel as keyof typeof levelLabel]} attendu pour {g.occupation} · {g.status === "declaree_a_confirmer" ? "déclarée, à démontrer" : g.status === "partielle" ? "niveau insuffisant" : "non démontrée"}</p>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader icon={Route} title="Plan d'apprentissage personnalisé" action={isAIConfigured() && consent.data?.granted ? <ActionButton variant="secondary" action={generateProgressPlanAction}><Sparkles className="size-3.5" aria-hidden /> {p ? "Regénérer" : "Générer"} mon plan</ActionButton> : undefined} />
        <CardBody>
          {!isAIConfigured() && <Alert tone="info">Le plan détaillé nécessite le service d&apos;IA, non configuré. Utilisez la liste des compétences à renforcer ci-dessus et les recommandations ci-dessous.</Alert>}
          {plan.data?.status === "echoue" && <Alert tone="error">{plan.data.error}</Alert>}
          {p && (
            <div className="space-y-3">
              <p className="text-xs text-muted">Généré le {formatDateTime(plan.data!.created_at)} · {p.horizon_weeks} semaines</p>
              <ol className="space-y-3">
                {p.steps.map((s, i) => (
                  <li key={i} className="rounded-lg border border-border p-4">
                    <p className="text-xs font-semibold text-gold-600">{s.period}</p>
                    <p className="font-medium text-navy-900">{s.objective}</p>
                    <ul className="mt-2 list-disc pl-5 text-sm text-slate-700">{s.actions.map((a, j) => <li key={j}>{a}</li>)}</ul>
                    {s.project_idea && <p className="mt-2 text-sm text-electric-800">Idée de projet : {s.project_idea}</p>}
                  </li>
                ))}
              </ol>
              {p.notes.length > 0 && <p className="text-sm text-muted">{p.notes.join(" ")}</p>}
            </div>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Recommandations" />
        <CardBody className="space-y-2">
          {(recs.data ?? []).length === 0 && <EmptyState title="Aucune recommandation" description="Passez un entretien : vos résultats proposeront ici les compétences à renforcer en priorité." />}
          {(recs.data ?? []).map((r) => (
            <div key={r.id} className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-border p-3">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-medium text-navy-900">{r.title}</p>
                  <Badge tone={r.origin === "ia" ? "purple" : "blue"}>{r.origin === "ia" ? "IA" : r.origin === "regles" ? "Entretien" : "Évaluateur"}</Badge>
                  {r.status === "terminee" && <Badge tone="green">Terminée</Badge>}
                </div>
                <p className="mt-1 text-xs text-slate-600">{r.body}</p>
              </div>
              <div className="flex gap-1">
                {r.status === "active" && <ActionButton variant="ghost" action={setRecommendationStatusAction.bind(null, r.id, "terminee")}>Marquer terminée</ActionButton>}
                <ActionButton variant="ghost" action={setRecommendationStatusAction.bind(null, r.id, "ignoree")}>Masquer</ActionButton>
              </div>
            </div>
          ))}
        </CardBody>
      </Card>
    </div>
  );
}
