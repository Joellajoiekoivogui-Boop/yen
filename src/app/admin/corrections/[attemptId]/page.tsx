import { notFound } from "next/navigation";
import { Sparkles } from "lucide-react";
import { ActionButton } from "@/components/forms/action-button";
import { Alert, Badge, Card, CardBody, CardHeader, PageHeader } from "@/components/ui";
import { requireStaff } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime, isUuid } from "@/lib/utils";
import { questionTypeLabel, type QuestionType } from "@/lib/labels";
import { MANUAL_TYPES } from "@/features/assessments/grading";
import { suggestGradeAction } from "@/features/ai/actions";
import { isAIConfigured } from "@/features/ai/provider";
import { ReviewForm } from "./review-form";

export default async function CorrectionPage(props: PageProps<"/admin/corrections/[attemptId]">) {
  const { attemptId } = await props.params;
  if (!isUuid(attemptId)) notFound();
  await requireStaff("assessments.review");
  const supabase = await createClient();
  const { data: t } = await supabase
    .from("assessment_attempts")
    .select("id, status, submitted_at, candidate_id, assessments(title), candidate_profiles(public_code)")
    .eq("id", attemptId)
    .maybeSingle();
  if (!t) notFound();
  const { data: answers } = await supabase
    .from("assessment_answers")
    .select("id, text_answer, auto_points, ai_suggested_points, ai_feedback, assessment_questions(prompt, points, question_type, rubric, position)")
    .eq("attempt_id", attemptId);
  const rows = (answers ?? []).map((a) => ({ ...a, q: a.assessment_questions as unknown as { prompt: string; points: number; question_type: QuestionType; rubric: { criterion: string; points: number }[]; position: number } })).sort((x, y) => x.q.position - y.q.position);
  const manual = rows.filter((r) => MANUAL_TYPES.includes(r.q.question_type) || r.auto_points == null);
  const { data: consent } = await supabase.from("candidate_consents").select("granted").eq("candidate_id", t.candidate_id).eq("consent_type", "traitement_ia").maybeSingle();
  const aiOk = isAIConfigured() && Boolean(consent?.granted);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader title={`Correction : ${(t.assessments as unknown as { title: string }).title}`} description={`Candidat ${(t.candidate_profiles as unknown as { public_code: string }).public_code} · soumise le ${formatDateTime(t.submitted_at)}`} />
      {t.status !== "en_correction" && <Alert tone="info">Cette tentative n&apos;est plus en attente de correction.</Alert>}
      <Alert tone="info">Les propositions de l&apos;IA sont indicatives : la note finale est la vôtre. {!aiOk && "(Aide IA indisponible : service non configuré ou consentement du candidat absent.)"}</Alert>
      {rows.filter((r) => !manual.includes(r)).length > 0 && <p className="text-sm text-muted">{rows.length - manual.length} question(s) corrigée(s) automatiquement : {rows.filter((r) => !manual.includes(r)).reduce((s, r) => s + Number(r.auto_points ?? 0), 0)} point(s).</p>}
      {manual.map((r, i) => (
        <Card key={r.id}>
          <CardHeader title={`Question ${i + 1} — ${r.q.points} point(s)`} description={questionTypeLabel[r.q.question_type]} action={aiOk && t.status === "en_correction" ? <ActionButton action={suggestGradeAction.bind(null, r.id)}><Sparkles className="size-3.5" aria-hidden /> Proposition IA</ActionButton> : undefined} />
          <CardBody className="space-y-3 text-sm">
            <p className="font-medium whitespace-pre-line text-navy-900">{r.q.prompt}</p>
            {r.q.rubric.length > 0 && <ul className="list-disc pl-5 text-xs text-muted">{r.q.rubric.map((c, j) => <li key={j}>{c.criterion} — {c.points} pt</li>)}</ul>}
            <div className="rounded-lg bg-slate-50 p-3 whitespace-pre-wrap text-slate-800">{r.text_answer || <em className="text-muted">Pas de réponse</em>}</div>
            {r.ai_suggested_points != null && <p className="rounded-lg border border-violet-200 bg-violet-50 p-3 text-violet-900"><Badge tone="purple">Proposition IA : {Number(r.ai_suggested_points)} / {r.q.points}</Badge> {r.ai_feedback}</p>}
          </CardBody>
        </Card>
      ))}
      {t.status === "en_correction" && (
        <Card>
          <CardHeader title="Notes finales" />
          <CardBody><ReviewForm attemptId={t.id} answers={manual.map((r) => ({ id: r.id, max: Number(r.q.points), suggested: r.ai_suggested_points != null ? Number(r.ai_suggested_points) : null }))} /></CardBody>
        </Card>
      )}
    </div>
  );
}
