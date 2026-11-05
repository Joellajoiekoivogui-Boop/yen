import { notFound } from "next/navigation";
import { Sparkles } from "lucide-react";
import { ActionButton } from "@/components/forms/action-button";
import { Alert, Card, CardBody, CardHeader, PageHeader } from "@/components/ui";
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
  const [{ data: answers }, suggestions] = await Promise.all([
    supabase
      .from("assessment_answers")
      .select("id, text_answer, auto_points, assessment_questions(prompt, points, question_type, rubric, position)")
      .eq("attempt_id", attemptId),
    loadAiSuggestions(supabase, attemptId),
  ]);
  const rows = (answers ?? [])
    .map((a) => ({
      ...a,
      ai_suggested_points: suggestions.get(a.id)?.points ?? null,
      ai_feedback: suggestions.get(a.id)?.feedback ?? null,
      q: a.assessment_questions as unknown as { prompt: string; points: number; question_type: QuestionType; rubric: { criterion: string; points: number }[]; position: number },
    }))
    .sort((x, y) => x.q.position - y.q.position);
  const manual = rows.filter((r) => MANUAL_TYPES.includes(r.q.question_type) || r.auto_points == null);
  const autoPoints = rows.filter((r) => !manual.includes(r)).reduce((sum, r) => sum + Number(r.auto_points ?? 0), 0);
  const totalMax = rows.reduce((sum, r) => sum + Number(r.q.points), 0);
  const { data: consent } = await supabase.from("candidate_consents").select("granted").eq("candidate_id", t.candidate_id).eq("consent_type", "traitement_ia").maybeSingle();
  const aiOk = isAIConfigured() && Boolean(consent?.granted);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader title={`Correction : ${(t.assessments as unknown as { title: string }).title}`} description={`Candidat ${(t.candidate_profiles as unknown as { public_code: string }).public_code} · soumise le ${formatDateTime(t.submitted_at)}`} />
      {t.status !== "en_correction" && <Alert tone="info">Cette tentative n&apos;est plus en attente de correction.</Alert>}
      <Alert tone="info">Les propositions de l&apos;IA sont indicatives : la note finale est la vôtre. {!aiOk && "(Aide IA indisponible : service non configuré ou consentement du candidat absent.)"}</Alert>
      {t.status === "en_correction" ? (
        <ReviewForm
          attemptId={t.id}
          autoPoints={autoPoints}
          totalMax={totalMax}
          items={manual.map((r) => ({
            id: r.id,
            prompt: r.q.prompt,
            typeLabel: questionTypeLabel[r.q.question_type],
            max: Number(r.q.points),
            rubric: r.q.rubric,
            answer: r.text_answer,
            suggested: r.ai_suggested_points != null ? Number(r.ai_suggested_points) : null,
            aiFeedback: r.ai_feedback,
            aiAction: aiOk ? (
              <ActionButton action={suggestGradeAction.bind(null, r.id)}>
                <Sparkles className="size-3.5" aria-hidden /> Proposition IA
              </ActionButton>
            ) : undefined,
          }))}
        />
      ) : (
        manual.map((r, i) => (
          <Card key={r.id}>
            <CardHeader title={`Question ${i + 1} — ${r.q.points} point(s)`} description={questionTypeLabel[r.q.question_type]} />
            <CardBody className="space-y-3 text-sm">
              <p className="font-medium whitespace-pre-line text-navy-900">{r.q.prompt}</p>
              <div className="rounded-lg bg-slate-50 p-3 whitespace-pre-wrap text-slate-800">{r.text_answer || <em className="text-muted">Pas de réponse</em>}</div>
            </CardBody>
          </Card>
        ))
      )}
    </div>
  );
}

/**
 * Propositions de note de l'IA, lisibles par les seuls correcteurs (fonction ai_grading_suggestions,
 * migration 15). Base pas encore mise à jour : lecture directe des colonnes, comme avant.
 */
async function loadAiSuggestions(supabase: Awaited<ReturnType<typeof createClient>>, attemptId: string) {
  const map = new Map<string, { points: number; feedback: string | null }>();
  const { data, error } = await supabase.rpc("ai_grading_suggestions", { p_attempt_id: attemptId });
  if (!error) {
    for (const r of (data ?? []) as { answer_id: string; suggested_points: number; feedback: string | null }[]) map.set(r.answer_id, { points: Number(r.suggested_points), feedback: r.feedback });
    return map;
  }
  const legacy = await supabase.from("assessment_answers").select("id, ai_suggested_points, ai_feedback").eq("attempt_id", attemptId).not("ai_suggested_points", "is", null);
  for (const r of legacy.data ?? []) map.set(r.id, { points: Number(r.ai_suggested_points), feedback: r.ai_feedback });
  return map;
}
