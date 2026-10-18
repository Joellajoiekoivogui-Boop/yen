import { describe, expect, it } from "vitest";
import { computeCompletion } from "@/features/candidates/completion";
import { aggregateDemonstrated, experienceMonths, type SkillAssessmentRow } from "@/features/candidates/skills";
import { enforceTraceability } from "@/features/ai/traceability";

describe("complétion du profil", () => {
  const base = {
    firstName: "", lastName: "", city: null, institution: null, yenProgram: null, educationLevel: null, primaryDomainId: null,
    opportunityTypes: [], headline: null, summary: null, hasCurrentCv: false, declaredSkillsCount: 0, educationCount: 0,
    experienceOrProjectCount: 0, consentsAnswered: 0,
  };
  it("0 % pour un profil vide, 100 % pour un profil complet", () => {
    expect(computeCompletion(base).percent).toBe(0);
    const full = computeCompletion({
      ...base, firstName: "A", lastName: "B", city: "Conakry", institution: "UGANC", yenProgram: "Dev web", educationLevel: "Licence",
      primaryDomainId: "d", opportunityTypes: ["stage"], headline: "Développeuse", summary: "x".repeat(100), hasCurrentCv: true,
      declaredSkillsCount: 3, educationCount: 1, experienceOrProjectCount: 1, consentsAnswered: 4,
    });
    expect(full.percent).toBe(100);
    expect(full.items.every((i) => i.done)).toBe(true);
  });
  it("liste les éléments manquants avec un lien", () => {
    const r = computeCompletion({ ...base, hasCurrentCv: true });
    expect(r.percent).toBe(15);
    expect(r.items.find((i) => i.key === "competences")?.href).toBe("/candidat/competences");
  });
});

describe("compétences démontrées", () => {
  const row = (o: Partial<SkillAssessmentRow>): SkillAssessmentRow => ({
    id: "r", skill_id: "s1", level: "debutant", score_percent: 60, source: "questionnaire", status: "valide",
    attempt_id: "a1", project_id: null, assessed_at: "2026-01-01", ...o,
  });
  it("retient le meilleur niveau valide et toutes les preuves", () => {
    const agg = aggregateDemonstrated([row({}), row({ id: "r2", level: "intermediaire", score_percent: 80, attempt_id: "a2" })]);
    expect(agg.s1.level).toBe("intermediaire");
    expect(agg.s1.bestScorePercent).toBe(80);
    expect(agg.s1.sources).toHaveLength(2);
  });
  it("ignore les preuves en attente, contestées ou invalidées", () => {
    const agg = aggregateDemonstrated([row({ status: "en_attente" }), row({ status: "conteste" }), row({ status: "invalide" })]);
    expect(agg.s1).toBeUndefined();
  });
});

describe("expérience", () => {
  it("cumule sans compter deux fois les chevauchements", () => {
    const m = experienceMonths([
      { start_date: "2024-01-01", end_date: "2024-07-01" },
      { start_date: "2024-04-01", end_date: "2024-10-01" },
    ]);
    expect(m).toBe(9);
  });
});

describe("traçabilité IA", () => {
  it("écarte les conclusions sans source connue", () => {
    const output = {
      strengths: [
        { text: "Bonne maîtrise SQL", source_ids: ["eval:1"] },
        { text: "Leadership exceptionnel", source_ids: ["inventé"] },
        { text: "Sans source", source_ids: [] },
      ],
      confidence: "moyenne",
    };
    const { output: out, report } = enforceTraceability(output, new Set(["eval:1"]));
    expect(out.strengths).toHaveLength(1);
    expect(report.dropped).toBe(2);
    expect(report.kept).toBe(1);
    expect(out.confidence).toBe("moyenne");
  });
});
