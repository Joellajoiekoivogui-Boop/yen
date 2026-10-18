import { describe, expect, it } from "vitest";
import { evidenceConfidence, gradeAttempt, gradeQuestion, levelFromScore, normalizeShortAnswer, progressRecommendations, type GradableQuestion } from "@/features/assessments/grading";

const single: GradableQuestion = { id: "q1", type: "choix_unique", points: 1, skillId: "s1", acceptedAnswers: [], options: [{ id: "a", isCorrect: true }, { id: "b", isCorrect: false }] };
const multi: GradableQuestion = { id: "q2", type: "choix_multiple", points: 2, skillId: "s1", acceptedAnswers: [], options: [{ id: "a", isCorrect: true }, { id: "b", isCorrect: true }, { id: "c", isCorrect: false }] };
const short: GradableQuestion = { id: "q3", type: "reponse_courte", points: 1, skillId: "s2", acceptedAnswers: ["git switch -c feature", "4,4"], options: [] };
const caseStudy: GradableQuestion = { id: "q4", type: "etude_de_cas", points: 10, skillId: "s2", acceptedAnswers: [], options: [] };

describe("correction des questions", () => {
  it("choix unique : tout ou rien", () => {
    expect(gradeQuestion(single, { questionId: "q1", selectedOptionIds: ["a"], textAnswer: null }).points).toBe(1);
    expect(gradeQuestion(single, { questionId: "q1", selectedOptionIds: ["b"], textAnswer: null }).points).toBe(0);
    expect(gradeQuestion(single, { questionId: "q1", selectedOptionIds: ["a", "b"], textAnswer: null }).points).toBe(0);
  });

  it("ignore les identifiants d'options étrangers (falsification)", () => {
    expect(gradeQuestion(single, { questionId: "q1", selectedOptionIds: ["a", "zzz"], textAnswer: null }).points).toBe(1);
  });

  it("choix multiple : proportionnel, une erreur annule", () => {
    expect(gradeQuestion(multi, { questionId: "q2", selectedOptionIds: ["a", "b"], textAnswer: null }).points).toBe(2);
    expect(gradeQuestion(multi, { questionId: "q2", selectedOptionIds: ["a"], textAnswer: null }).points).toBe(1);
    expect(gradeQuestion(multi, { questionId: "q2", selectedOptionIds: ["a", "c"], textAnswer: null }).points).toBe(0);
  });

  it("réponse courte : comparaison normalisée", () => {
    expect(gradeQuestion(short, { questionId: "q3", selectedOptionIds: [], textAnswer: "  Git Switch -c feature " }).points).toBe(1);
    expect(gradeQuestion(short, { questionId: "q3", selectedOptionIds: [], textAnswer: "4,4" }).points).toBe(1);
    expect(gradeQuestion(short, { questionId: "q3", selectedOptionIds: [], textAnswer: "git branch" }).points).toBe(0);
    expect(normalizeShortAnswer("Électricité.")).toBe("electricite");
  });

  it("étude de cas : correction humaine requise sauf réponse vide", () => {
    expect(gradeQuestion(caseStudy, { questionId: "q4", selectedOptionIds: [], textAnswer: "Ma réponse" })).toMatchObject({ points: null, needsReview: true });
    expect(gradeQuestion(caseStudy, { questionId: "q4", selectedOptionIds: [], textAnswer: "   " })).toMatchObject({ points: 0, needsReview: false });
  });

  it("question sans réponse = 0", () => {
    expect(gradeQuestion(single, undefined).points).toBe(0);
  });
});

describe("correction d'une tentative", () => {
  it("calcule le score et le détail par compétence", () => {
    const g = gradeAttempt([single, multi, short], [
      { questionId: "q1", selectedOptionIds: ["a"], textAnswer: null },
      { questionId: "q2", selectedOptionIds: ["a"], textAnswer: null },
      { questionId: "q3", selectedOptionIds: [], textAnswer: "faux" },
    ]);
    expect(g.maxPoints).toBe(4);
    expect(g.earnedPoints).toBe(2);
    expect(g.scorePercent).toBe(50);
    expect(g.needsReview).toBe(false);
    expect(g.bySkill.find((s) => s.skillId === "s1")).toMatchObject({ earned: 2, max: 3, questionCount: 2 });
  });

  it("reste en attente tant qu'une correction humaine est nécessaire, puis intègre la note", () => {
    const answers = [{ questionId: "q4", selectedOptionIds: [], textAnswer: "réponse argumentée" }];
    const pending = gradeAttempt([caseStudy], answers);
    expect(pending.needsReview).toBe(true);
    expect(pending.scorePercent).toBeNull();
    const reviewed = gradeAttempt([caseStudy], answers, { q4: 7 });
    expect(reviewed.needsReview).toBe(false);
    expect(reviewed.scorePercent).toBe(70);
    expect(gradeAttempt([caseStudy], answers, { q4: 99 }).earnedPoints).toBe(10); // plafonné
  });
});

describe("niveau attribuable", () => {
  it("aucun niveau sous le seuil", () => {
    expect(levelFromScore("intermediaire", 55, 60)).toBeNull();
  });
  it("niveau de l'évaluation au-dessus du seuil", () => {
    expect(levelFromScore("intermediaire", 80, 60)).toBe("intermediaire");
  });
  it("jamais expert automatiquement, même avec 100 %", () => {
    expect(levelFromScore("expert", 100, 60)).toBe("avance");
    expect(levelFromScore("expert", 100, 60, { autoMaxLevel: "expert" })).toBe("avance");
    expect(levelFromScore("avance", 100, 60, { autoMaxLevel: "intermediaire" })).toBe("intermediaire");
  });
  it("expert possible uniquement après validation humaine", () => {
    expect(levelFromScore("expert", 95, 60, { humanValidated: true })).toBe("expert");
  });
  it("confiance selon le volume de preuves", () => {
    expect(evidenceConfidence(1, false)).toBe("faible");
    expect(evidenceConfidence(3, false)).toBe("moyenne");
    expect(evidenceConfidence(2, true)).toBe("elevee");
  });
  it("recommandations pour les compétences sous le seuil", () => {
    const recs = progressRecommendations([{ skillId: "s1", earned: 1, max: 4, percent: 25, questionCount: 2 }, { skillId: "s2", earned: 4, max: 4, percent: 100, questionCount: 1 }], { s1: "SQL" }, 60);
    expect(recs).toHaveLength(1);
    expect(recs[0].title).toContain("SQL");
  });
});
