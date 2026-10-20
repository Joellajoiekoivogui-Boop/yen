import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { QuestionType } from "@/lib/labels";

export interface DeliveredQuestion {
  id: string;
  position: number;
  type: QuestionType;
  prompt: string;
  points: number;
  rubric: { criterion: string; points: number }[];
  options: { id: string; label: string }[];
}

/**
 * Questions d'une tentative en cours, SANS clés de correction : la fonction SQL
 * get_attempt_questions vérifie que la tentative appartient au candidat connecté.
 */
export async function deliverAttemptQuestions(attemptId: string): Promise<DeliveredQuestion[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_attempt_questions", { p_attempt: attemptId });
  if (error) throw new Error(error.message);
  return ((data ?? []) as { id: string; position: number; type: QuestionType; prompt: string; points: number | string; rubric: unknown; options: { id: string; label: string }[] }[]).map((q) => ({
    id: q.id,
    position: q.position,
    type: q.type,
    prompt: q.prompt,
    points: Number(q.points),
    rubric: (Array.isArray(q.rubric) ? q.rubric : []) as { criterion: string; points: number }[],
    options: q.options ?? [],
  }));
}

export interface AttemptReviewItem {
  prompt: string;
  points: number | null;
  max: number;
  explanation: string | null;
  comment: string | null;
  position: number;
}

/** Corrigé d'une tentative terminée (points, explications, commentaires), pour son candidat. */
export async function loadAttemptReview(attemptId: string): Promise<AttemptReviewItem[]> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("get_attempt_review", { p_attempt: attemptId });
  return ((data ?? []) as { prompt: string; points: number | string | null; max: number | string; explanation: string | null; comment: string | null; position: number }[]).map((r) => ({
    prompt: r.prompt,
    points: r.points != null ? Number(r.points) : null,
    max: Number(r.max),
    explanation: r.explanation,
    comment: r.comment,
    position: r.position,
  }));
}
