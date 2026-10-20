import { notFound } from "next/navigation";
import { CheckCircle2, Hourglass, XCircle } from "lucide-react";
import { Alert, Badge, ButtonLink, Card, CardBody, CardHeader, PageHeader, ProgressBar } from "@/components/ui";
import { requireCandidate } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime, isUuid } from "@/lib/utils";
import { deliverAttemptQuestions, loadAttemptReview, type AttemptReviewItem } from "@/features/assessments/service";
import { AttemptRunner } from "./attempt-runner";

export default async function AttemptPage(props: PageProps<"/candidat/evaluations/tentative/[attemptId]">) {
  const { attemptId } = await props.params;
  if (!isUuid(attemptId)) notFound();
  const ctx = await requireCandidate();
  const supabase = await createClient();
  // RLS : la tentative n'est visible que par son propriétaire
  const { data: t } = await supabase
    .from("assessment_attempts")
    .select("id, assessment_id, status, deadline_at, submitted_at, graded_at, score_percent, passed, earned_points, max_points, reviewer_comment, result_details, recommendations, assessments(title, passing_score)")
    .eq("id", attemptId)
    .eq("candidate_id", ctx.candidateId)
    .maybeSingle();
  if (!t) notFound();
  const a = t.assessments as unknown as { title: string; passing_score: number };

  // temps imparti (+ 5 min de tolérance) écoulé sans soumission : les questions ne sont plus distribuées
  const expired = t.status === "en_cours" && isPastDeadline(t.deadline_at);
  if (t.status === "en_cours" && !expired) {
    const questions = await deliverAttemptQuestions(t.id);
    return (
      <div className="mx-auto max-w-3xl">
        <PageHeader title={a.title} description="Vos réponses sont corrigées côté serveur à la soumission." />
        <AttemptRunner attemptId={t.id} deadline={t.deadline_at} questions={questions} />
      </div>
    );
  }

  // Résultat : réponses, points et explications (après correction uniquement)
  const review: AttemptReviewItem[] = t.status === "corrige" ? await loadAttemptReview(t.id) : [];
  const bySkill = ((t.result_details as { bySkill?: { skillId: string; name: string | null; percent: number; earned: number; max: number }[] })?.bySkill) ?? [];
  const recs = (t.recommendations as { title: string; body: string }[]) ?? [];

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader title={a.title} description={`Soumise le ${formatDateTime(t.submitted_at)}`} actions={<ButtonLink href="/candidat/evaluations" variant="outline">Retour</ButtonLink>} />
      {t.status === "en_correction" && <Alert tone="info" title="Correction en cours">Certaines réponses sont corrigées par un évaluateur YEN. Vous serez notifié(e) du résultat.</Alert>}
      {(t.status === "expire" || expired) && <Alert tone="warning" title="Tentative expirée">Le temps imparti a été dépassé.</Alert>}
      {t.status === "corrige" && (
        <Card className="p-6">
          <div className="flex items-center gap-4">
            {t.passed ? <CheckCircle2 className="size-10 text-emerald-600" aria-hidden /> : <XCircle className="size-10 text-amber-500" aria-hidden />}
            <div>
              <p className="text-3xl font-bold text-navy-900 tabular-nums">{Math.round(Number(t.score_percent))} %</p>
              <p className="text-sm text-muted">{Number(t.earned_points)} / {Number(t.max_points)} points · seuil {Number(a.passing_score)} % · {t.passed ? "réussie" : "non réussie"}</p>
            </div>
          </div>
          {t.reviewer_comment && <p className="mt-4 rounded-lg bg-slate-50 p-3 text-sm text-slate-700"><strong>Commentaire de l&apos;évaluateur :</strong> {t.reviewer_comment}</p>}
        </Card>
      )}
      {bySkill.length > 0 && (
        <Card>
          <CardHeader title="Détail par compétence" description="Une compétence est démontrée lorsque son score atteint le seuil." />
          <CardBody className="space-y-3">
            {bySkill.map((s) => (
              <div key={s.skillId}>
                <div className="flex justify-between text-sm"><span className="text-navy-900">{s.name}</span><span className="tabular-nums text-muted">{Math.round(s.percent)} %</span></div>
                <ProgressBar value={s.percent} tone={s.percent >= Number(a.passing_score) ? "gold" : "amber"} label={s.name ?? ""} className="mt-1" />
              </div>
            ))}
          </CardBody>
        </Card>
      )}
      {recs.length > 0 && (
        <Card>
          <CardHeader icon={Hourglass} title="Recommandations de progression" />
          <CardBody className="space-y-2">{recs.map((r, i) => <div key={i} className="rounded-lg bg-slate-50 p-3"><p className="text-sm font-medium text-navy-900">{r.title}</p><p className="text-xs text-slate-600">{r.body}</p></div>)}</CardBody>
        </Card>
      )}
      {review.length > 0 && (
        <Card>
          <CardHeader title="Correction détaillée" />
          <CardBody className="space-y-4">
            {review.map((r, i) => (
              <div key={i} className="border-b border-border pb-3 last:border-0">
                <div className="flex justify-between gap-3">
                  <p className="text-sm font-medium whitespace-pre-line text-navy-900">{i + 1}. {r.prompt}</p>
                  <Badge tone={r.points === r.max ? "green" : r.points ? "amber" : "red"}>{r.points ?? 0}/{r.max}</Badge>
                </div>
                {r.explanation && <p className="mt-1 text-xs text-slate-600">Explication : {r.explanation}</p>}
                {r.comment && <p className="mt-1 text-xs text-slate-600">Commentaire : {r.comment}</p>}
              </div>
            ))}
          </CardBody>
        </Card>
      )}
    </div>
  );
}

function isPastDeadline(deadline: string): boolean {
  return new Date(deadline).getTime() + 5 * 60_000 < Date.now();
}
