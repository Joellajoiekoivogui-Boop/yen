/**
 * Correction automatique des évaluations (logique pure, testée unitairement).
 *
 * Règles (affichées au candidat dans le barème) :
 *  - choix unique : tout ou rien ;
 *  - choix multiple : points proportionnels aux bonnes réponses cochées ; toute
 *    mauvaise réponse cochée annule la question ;
 *  - réponse courte : comparaison normalisée avec les réponses acceptées ;
 *  - réponses libres, études de cas, exercices : correction humaine obligatoire
 *    (une proposition IA peut assister l'évaluateur, jamais décider seule) ;
 *  - un questionnaire ne peut pas attribuer automatiquement le niveau expert.
 */
import { LEVEL_RANK, type QuestionType, type SkillLevel } from "@/lib/labels";
import { normalizeText } from "@/lib/utils";

export interface GradableQuestion {
  id: string;
  type: QuestionType;
  points: number;
  skillId: string | null;
  acceptedAnswers: string[];
  options: { id: string; isCorrect: boolean }[];
}

export interface CandidateAnswer {
  questionId: string;
  selectedOptionIds: string[];
  textAnswer: string | null;
}

export interface QuestionGrade {
  questionId: string;
  maxPoints: number;
  /** null = en attente de correction humaine */
  points: number | null;
  needsReview: boolean;
  correct: boolean | null;
}

export const MANUAL_TYPES: QuestionType[] = ["reponse_longue", "etude_de_cas", "exercice_pratique"];

export function normalizeShortAnswer(s: string): string {
  return normalizeText(s)
    .replace(/[`"'«»]/g, "")
    .replace(/\s*([.,;:!?])\s*$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function gradeQuestion(q: GradableQuestion, a: CandidateAnswer | undefined): QuestionGrade {
  const base = { questionId: q.id, maxPoints: q.points };
  if (MANUAL_TYPES.includes(q.type)) {
    const empty = !a?.textAnswer?.trim();
    // Une réponse vide n'a pas besoin d'être relue : elle vaut 0.
    return empty ? { ...base, points: 0, needsReview: false, correct: false } : { ...base, points: null, needsReview: true, correct: null };
  }
  if (!a) return { ...base, points: 0, needsReview: false, correct: false };

  const validIds = new Set(q.options.map((o) => o.id));
  const selected = [...new Set(a.selectedOptionIds.filter((id) => validIds.has(id)))];

  switch (q.type) {
    case "choix_unique": {
      const correct = q.options.find((o) => o.isCorrect);
      const ok = selected.length === 1 && correct?.id === selected[0];
      return { ...base, points: ok ? q.points : 0, needsReview: false, correct: ok };
    }
    case "choix_multiple": {
      const correctIds = new Set(q.options.filter((o) => o.isCorrect).map((o) => o.id));
      if (correctIds.size === 0) return { ...base, points: null, needsReview: true, correct: null };
      const wrong = selected.some((id) => !correctIds.has(id));
      if (wrong || selected.length === 0) return { ...base, points: 0, needsReview: false, correct: false };
      const ratio = selected.length / correctIds.size;
      return { ...base, points: round2(q.points * ratio), needsReview: false, correct: ratio === 1 };
    }
    case "reponse_courte": {
      if (q.acceptedAnswers.length === 0) {
        return a.textAnswer?.trim() ? { ...base, points: null, needsReview: true, correct: null } : { ...base, points: 0, needsReview: false, correct: false };
      }
      const given = normalizeShortAnswer(a.textAnswer ?? "");
      const ok = given.length > 0 && q.acceptedAnswers.some((acc) => normalizeShortAnswer(acc) === given);
      return { ...base, points: ok ? q.points : 0, needsReview: false, correct: ok };
    }
    default:
      return { ...base, points: null, needsReview: true, correct: null };
  }
}

export interface SkillBreakdown {
  skillId: string;
  earned: number;
  max: number;
  percent: number;
  questionCount: number;
}

export interface AttemptGrade {
  grades: QuestionGrade[];
  maxPoints: number;
  earnedPoints: number;
  /** null tant qu'une correction humaine est attendue */
  scorePercent: number | null;
  needsReview: boolean;
  bySkill: SkillBreakdown[];
}

export function gradeAttempt(questions: GradableQuestion[], answers: CandidateAnswer[], overrides: Record<string, number | null> = {}): AttemptGrade {
  const byQ = new Map(answers.map((a) => [a.questionId, a]));
  const grades = questions.map((q) => {
    const g = gradeQuestion(q, byQ.get(q.id));
    const o = overrides[q.id];
    if (o != null) {
      const pts = Math.max(0, Math.min(q.points, o));
      return { ...g, points: pts, needsReview: false, correct: pts === q.points };
    }
    return g;
  });
  const maxPoints = round2(grades.reduce((s, g) => s + g.maxPoints, 0));
  const earnedPoints = round2(grades.reduce((s, g) => s + (g.points ?? 0), 0));
  const needsReview = grades.some((g) => g.needsReview);

  const skillMap = new Map<string, SkillBreakdown>();
  questions.forEach((q, i) => {
    if (!q.skillId) return;
    const s = skillMap.get(q.skillId) ?? { skillId: q.skillId, earned: 0, max: 0, percent: 0, questionCount: 0 };
    s.max += q.points;
    s.earned += grades[i].points ?? 0;
    s.questionCount += 1;
    skillMap.set(q.skillId, s);
  });
  const bySkill = [...skillMap.values()].map((s) => ({ ...s, earned: round2(s.earned), max: round2(s.max), percent: s.max ? round2((100 * s.earned) / s.max) : 0 }));

  return {
    grades,
    maxPoints,
    earnedPoints,
    scorePercent: needsReview || maxPoints === 0 ? null : round2((100 * earnedPoints) / maxPoints),
    needsReview,
    bySkill,
  };
}

/**
 * Niveau démontré attribuable à partir d'un résultat.
 *  - en dessous du seuil : aucun niveau démontré ;
 *  - sinon : niveau de l'évaluation, plafonné (par défaut « avancé ») ;
 *  - jamais « expert » sans validation par un évaluateur.
 */
export function levelFromScore(
  assessmentLevel: SkillLevel,
  percent: number,
  passingScore: number,
  opts: { autoMaxLevel?: SkillLevel; humanValidated?: boolean } = {},
): SkillLevel | null {
  if (percent < passingScore) return null;
  const cap: SkillLevel = opts.humanValidated ? "expert" : opts.autoMaxLevel && opts.autoMaxLevel !== "expert" ? opts.autoMaxLevel : "avance";
  return LEVEL_RANK[assessmentLevel] <= LEVEL_RANK[cap] ? assessmentLevel : cap;
}

/** Confiance d'une preuve issue d'un questionnaire selon le nombre de questions. */
export function evidenceConfidence(questionCount: number, humanValidated: boolean): "faible" | "moyenne" | "elevee" {
  if (humanValidated) return questionCount >= 2 ? "elevee" : "moyenne";
  return questionCount >= 3 ? "moyenne" : "faible";
}

/** Recommandations de progression déterministes à partir du détail par compétence. */
export function progressRecommendations(bySkill: SkillBreakdown[], skillNames: Record<string, string>, passingScore: number) {
  return bySkill
    .filter((s) => s.percent < passingScore)
    .sort((a, b) => a.percent - b.percent)
    .map((s) => ({
      skillId: s.skillId,
      title: `Renforcer : ${skillNames[s.skillId] ?? "compétence"}`,
      body: `Résultat de ${s.percent.toFixed(0)} % sur ${s.questionCount} question(s) (seuil ${passingScore} %). Revoyez les explications des questions manquées, puis réalisez un petit projet pratique mobilisant cette compétence avant de repasser l'évaluation.`,
    }));
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}
