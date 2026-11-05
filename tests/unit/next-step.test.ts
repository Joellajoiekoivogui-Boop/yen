import { describe, expect, it } from "vitest";
import { computeCompletion } from "@/features/candidates/completion";
import { nextStep, type NextStepInput } from "@/features/candidates/next-step";

const empty = computeCompletion({
  firstName: "", lastName: "", city: null, institution: null, yenProgram: null, educationLevel: null, primaryDomainId: null,
  opportunityTypes: [], headline: null, summary: null, hasCurrentCv: false, declaredSkillsCount: 0, educationCount: 0,
  experienceOrProjectCount: 0, consentsAnswered: 0,
}).items;
const full = empty.map((i) => ({ ...i, done: true }));
const base: NextStepInput = { attemptInProgress: null, completionItems: full, skillToDemonstrate: null, recommendation: null, bestOffer: null };

describe("prochaine étape du candidat", () => {
  it("un entretien commencé passe avant tout le reste", () => {
    const s = nextStep({ ...base, completionItems: empty, attemptInProgress: { id: "t1", title: "Réseaux", minutesLeft: 12.4 } });
    expect(s.key).toBe("reprendre");
    expect(s.href).toBe("/candidat/evaluations/tentative/t1");
    expect(s.duration).toBe("12 min restantes");
  });

  it("puis le domaine principal, puis les compétences, puis leur démonstration", () => {
    expect(nextStep({ ...base, completionItems: empty }).key).toBe("orientation");
    const withDomain = empty.map((i) => (i.key === "orientation" ? { ...i, done: true } : i));
    expect(nextStep({ ...base, completionItems: withDomain }).key).toBe("competences");
    const withSkills = withDomain.map((i) => (i.key === "competences" ? { ...i, done: true } : i));
    expect(nextStep({ ...base, completionItems: withSkills, skillToDemonstrate: "SQL" }).title).toBe("Démontrez « SQL »");
    expect(nextStep({ ...base, completionItems: withSkills }).key).toBe("cv");
  });

  it("profil complet : recommandation, sinon offre la plus compatible, sinon un nouvel entretien", () => {
    expect(nextStep({ ...base, recommendation: { title: "Réviser SQL" } }).key).toBe("recommandation");
    expect(nextStep({ ...base, bestOffer: { id: "o1", title: "Stage web", score: 72 } }).href).toBe("/candidat/offres/o1");
    expect(nextStep(base).key).toBe("entretien");
  });

  it("chaque étape donne une raison, une durée et une seule action", () => {
    for (const s of [nextStep({ ...base, completionItems: empty }), nextStep(base)]) {
      expect(s.why.length).toBeGreaterThan(10);
      expect(s.duration).toBeTruthy();
      expect(s.cta).toBeTruthy();
    }
  });
});
