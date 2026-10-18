import { describe, expect, it } from "vitest";
import { computeMatch, DEFAULT_WEIGHTS, educationRank, normalizeWeights, rankMatches, resolveWeights, type CandidateEvidence, type MatchTarget } from "@/features/matching/engine";

const target: MatchTarget = {
  kind: "offer",
  id: "offer-1",
  title: "Développeur web junior",
  domainId: "dom-info",
  requirements: [
    { skillId: "js", skillName: "JavaScript", requiredLevel: "intermediaire", importance: "obligatoire" },
    { skillId: "sql", skillName: "SQL", requiredLevel: "intermediaire", importance: "importante" },
    { skillId: "git", skillName: "Git", requiredLevel: "debutant", importance: "souhaitee" },
  ],
  educationRank: 4,
  minExperienceMonths: 6,
  relevantCertifications: ["AWS Certified Developer"],
  weights: DEFAULT_WEIGHTS,
};

const empty: CandidateEvidence = {
  candidateId: "c0",
  primaryDomainId: null,
  demonstrated: {},
  declared: {},
  testScores: {},
  projects: [],
  educationRank: null,
  hasEducationData: false,
  certifications: [],
  relevantExperienceMonths: null,
  hasExperienceData: false,
};

const strong: CandidateEvidence = {
  ...empty,
  candidateId: "c1",
  primaryDomainId: "dom-info",
  demonstrated: {
    js: { level: "avance", bestScorePercent: 90, sources: [{ type: "questionnaire", id: "a1", label: "Questionnaire (90 %)" }] },
    sql: { level: "intermediaire", bestScorePercent: 75, sources: [{ type: "questionnaire", id: "a2", label: "Questionnaire (75 %)" }] },
    git: { level: "intermediaire", bestScorePercent: null, sources: [{ type: "projet", id: "p1", label: "Projet vérifié" }] },
  },
  testScores: { js: [{ percent: 90, ref: { type: "questionnaire", id: "a1", label: "" } }], sql: [{ percent: 75, ref: { type: "questionnaire", id: "a2", label: "" } }] },
  projects: [{ id: "p1", title: "Site ONG", skillIds: ["js", "git"], verified: true }],
  educationRank: 4,
  hasEducationData: true,
  certifications: [],
  relevantExperienceMonths: 8,
  hasExperienceData: true,
};

describe("moteur de compatibilité", () => {
  it("produit un score élevé et explicable pour un profil solide", () => {
    const m = computeMatch(target, strong);
    expect(m.score).toBeGreaterThan(80);
    expect(m.score).toBeLessThanOrEqual(100);
    expect(m.meetsMandatory).toBe(true);
    expect(m.confidenceLabel).toBe("elevee");
    expect(m.components).toHaveLength(5);
    expect(m.strengths.some((s) => s.includes("JavaScript"))).toBe(true);
    expect(m.disclaimer).toMatch(/pas une probabilité d'embauche/);
  });

  it("n'attribue pas silencieusement zéro aux données manquantes", () => {
    const m = computeMatch(target, empty);
    const demonstrated = m.components.find((c) => c.key === "demonstrated_skills")!;
    expect(demonstrated.value).toBeNull();
    expect(demonstrated.explanation).toMatch(/Aucune compétence/);
    expect(m.missingData.length).toBeGreaterThan(0);
    expect(m.confidenceLabel).toBe("faible");
    expect(m.floorScore).toBeLessThanOrEqual(m.score);
  });

  it("une compétence seulement déclarée n'est jamais considérée comme démontrée", () => {
    const declaredOnly: CandidateEvidence = { ...empty, declared: { js: { level: "expert" }, sql: { level: "expert" }, git: { level: "expert" } } };
    const m = computeMatch(target, declaredOnly);
    expect(m.requirements.every((r) => r.status === "declaree_a_confirmer")).toBe(true);
    expect(m.meetsMandatory).toBe(false);
    expect(m.unmetMandatory).toEqual(["JavaScript"]);
    expect(m.gaps[0]).toMatch(/pas encore démontrée/);
  });

  it("signale les exigences obligatoires non satisfaites sans exclure le candidat", () => {
    const partial: CandidateEvidence = { ...strong, demonstrated: { ...strong.demonstrated, js: { level: "debutant", bestScorePercent: 60, sources: [] } } };
    const m = computeMatch(target, partial);
    expect(m.meetsMandatory).toBe(false);
    expect(m.requirements.find((r) => r.skillId === "js")!.status).toBe("partielle");
    expect(m.score).toBeGreaterThan(0);
  });

  it("respecte les pondérations configurées", () => {
    const onlyExperience = { ...target, weights: { demonstrated_skills: 0, assessments: 0, projects: 0, education: 0, experience: 100 } };
    const m = computeMatch(onlyExperience, { ...strong, relevantExperienceMonths: 3 });
    expect(m.score).toBe(50); // 3 mois sur 6 demandés
  });

  it("un projet non vérifié compte pour moitié", () => {
    const t = { ...target, weights: { demonstrated_skills: 0, assessments: 0, projects: 100, education: 0, experience: 0 } };
    const verified = computeMatch(t, strong).score;
    const unverified = computeMatch(t, { ...strong, projects: [{ ...strong.projects[0], verified: false }] }).score;
    expect(unverified).toBeLessThan(verified);
    expect(Math.abs(unverified - verified / 2)).toBeLessThanOrEqual(1);
  });

  it("classe par score puis respect des exigences obligatoires puis confiance", () => {
    const ranked = rankMatches([
      { id: "a", match: computeMatch(target, empty) },
      { id: "b", match: computeMatch(target, strong) },
    ]);
    expect(ranked[0].id).toBe("b");
  });

  it("ne dépend d'aucune caractéristique sensible (le type ne les accepte pas)", () => {
    const withExtras = { ...strong, gender: "F", religion: "x", photoUrl: "y" } as unknown as CandidateEvidence;
    expect(computeMatch(target, withExtras)).toEqual(computeMatch(target, strong));
  });
});

describe("pondérations", () => {
  it("résout offre > métier > plateforme", () => {
    expect(resolveWeights(null, { experience: 50, education: 50, demonstrated_skills: 0, assessments: 0, projects: 0 }).experience).toBe(50);
    expect(resolveWeights(undefined, null)).toEqual(DEFAULT_WEIGHTS);
  });
  it("ignore les valeurs négatives ou invalides", () => {
    expect(normalizeWeights({ experience: -5, education: Number.NaN }).experience).toBe(DEFAULT_WEIGHTS.experience);
  });
});

describe("niveau d'études", () => {
  it("reconnaît les niveaux courants", () => {
    expect(educationRank("Master 2")).toBe(5);
    expect(educationRank("Diplôme d'ingénieur")).toBe(5);
    expect(educationRank("Licence professionnelle")).toBe(4);
    expect(educationRank("BTS")).toBe(3);
    expect(educationRank("Baccalauréat")).toBe(2);
    expect(educationRank("")).toBeNull();
  });
});
