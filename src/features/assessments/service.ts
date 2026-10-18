import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/server";
import { getAutoMaxLevel } from "@/features/admin/settings";
import { notifyCandidate } from "@/features/notifications/service";
import type { QuestionType, SkillLevel } from "@/lib/labels";
import { evidenceConfidence, gradeAttempt, levelFromScore, progressRecommendations, type GradableQuestion } from "./grading";

export interface DeliveredQuestion {
  id: string;
  position: number;
  type: QuestionType;
  prompt: string;
  points: number;
  rubric: { criterion: string; points: number }[];
  options: { id: string; label: string }[];
}

/** Questions d'une évaluation SANS clés de correction (lecture via la clé de service, après contrôle d'accès). */
export async function deliverQuestions(assessmentId: string): Promise<DeliveredQuestion[]> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("assessment_questions")
    .select("id, position, question_type, prompt, points, rubric, assessment_options(id, label, position)")
    .eq("assessment_id", assessmentId)
    .order("position");
  return (data ?? []).map((q) => ({
    id: q.id,
    position: q.position,
    type: q.question_type as QuestionType,
    prompt: q.prompt,
    points: Number(q.points),
    rubric: (q.rubric ?? []) as { criterion: string; points: number }[],
    options: ((q.assessment_options ?? []) as { id: string; label: string; position: number }[]).sort((a, b) => a.position - b.position).map(({ id, label }) => ({ id, label })),
  }));
}

export async function loadGradableQuestions(admin: SupabaseClient, assessmentId: string): Promise<(GradableQuestion & { explanation: string | null })[]> {
  const { data } = await admin
    .from("assessment_questions")
    .select("id, question_type, points, skill_id, accepted_answers, explanation, assessment_options(id, is_correct)")
    .eq("assessment_id", assessmentId)
    .order("position");
  return (data ?? []).map((q) => ({
    id: q.id,
    type: q.question_type as QuestionType,
    points: Number(q.points),
    skillId: q.skill_id,
    acceptedAnswers: q.accepted_answers ?? [],
    explanation: q.explanation,
    options: ((q.assessment_options ?? []) as { id: string; is_correct: boolean }[]).map((o) => ({ id: o.id, isCorrect: o.is_correct })),
  }));
}

/**
 * Finalise une tentative entièrement corrigée : score, réussite, détail par
 * compétence, recommandations et création des preuves de compétences.
 * `reviewerId` non nul = correction validée par un évaluateur humain.
 */
export async function finalizeAttempt(attemptId: string, reviewerId: string | null, reviewerComment?: string | null) {
  const admin = createAdminClient();
  const { data: attempt } = await admin
    .from("assessment_attempts")
    .select("id, candidate_id, assessment_id, assessments(title, level, passing_score, assessment_type)")
    .eq("id", attemptId)
    .single();
  if (!attempt) throw new Error("Tentative introuvable");
  const assessment = attempt.assessments as unknown as { title: string; level: SkillLevel; passing_score: number; assessment_type: string };

  const questions = await loadGradableQuestions(admin, attempt.assessment_id);
  const { data: answers } = await admin.from("assessment_answers").select("id, question_id, selected_option_ids, text_answer, manual_points").eq("attempt_id", attemptId);
  const overrides = Object.fromEntries((answers ?? []).filter((a) => a.manual_points != null).map((a) => [a.question_id, Number(a.manual_points)]));
  const grade = gradeAttempt(
    questions,
    (answers ?? []).map((a) => ({ questionId: a.question_id, selectedOptionIds: a.selected_option_ids ?? [], textAnswer: a.text_answer })),
    overrides,
  );
  if (grade.needsReview || grade.scorePercent == null) throw new Error("Correction incomplète");

  // Points finaux par réponse
  for (const g of grade.grades) {
    const a = answers?.find((x) => x.question_id === g.questionId);
    if (a) await admin.from("assessment_answers").update({ final_points: g.points, auto_points: overrides[g.questionId] == null ? g.points : undefined }).eq("id", a.id);
  }

  const passing = Number(assessment.passing_score);
  const { data: skills } = await admin.from("skills").select("id, name").in("id", grade.bySkill.map((s) => s.skillId));
  const names = Object.fromEntries((skills ?? []).map((s) => [s.id, s.name]));
  const recommendations = progressRecommendations(grade.bySkill, names, passing);
  const autoMax = await getAutoMaxLevel();
  const humanValidated = reviewerId != null;

  const source = assessment.assessment_type === "exercice_pratique" || assessment.assessment_type === "etude_de_cas" ? "exercice" : "questionnaire";
  const evidences = grade.bySkill
    .map((s) => {
      const level = levelFromScore(assessment.level, s.percent, passing, { autoMaxLevel: autoMax, humanValidated });
      if (!level) return null;
      // la contrainte SQL interdit « expert » pour la source questionnaire : l'évaluateur devient la source
      const src = level === "expert" ? "evaluateur" : source;
      return {
        candidate_id: attempt.candidate_id, skill_id: s.skillId, level, score_percent: s.percent, source: src, attempt_id: attemptId,
        assessed_by: reviewerId, confidence: evidenceConfidence(s.questionCount, humanValidated), status: "valide",
        notes: `${assessment.title} : ${s.earned}/${s.max} point(s) sur ${s.questionCount} question(s).`,
      };
    })
    .filter((e): e is NonNullable<typeof e> => e !== null);

  await admin.from("assessment_attempts").update({
    status: "corrige",
    graded_at: new Date().toISOString(),
    max_points: grade.maxPoints,
    earned_points: grade.earnedPoints,
    score_percent: grade.scorePercent,
    passed: grade.scorePercent >= passing,
    needs_human_review: false,
    reviewed_by: reviewerId,
    reviewer_comment: reviewerComment ?? null,
    result_details: { bySkill: grade.bySkill.map((s) => ({ ...s, name: names[s.skillId] ?? null })) },
    recommendations,
  }).eq("id", attemptId);

  if (evidences.length) await admin.from("skill_assessments").insert(evidences);
  if (recommendations.length) {
    await admin.from("ai_recommendations").insert(recommendations.map((r) => ({
      candidate_id: attempt.candidate_id, rec_type: "competence", title: r.title, body: r.body, skill_id: r.skillId, origin: "regles", source_refs: [`attempt:${attemptId}`],
    })));
  }
  await notifyCandidate(attempt.candidate_id, {
    category: "evaluation",
    title: `Résultat disponible : ${assessment.title}`,
    body: `Score : ${grade.scorePercent.toFixed(0)} %${grade.scorePercent >= passing ? " — réussi" : ""}.`,
    link: `/candidat/evaluations/tentative/${attemptId}`,
  });
  return grade;
}
