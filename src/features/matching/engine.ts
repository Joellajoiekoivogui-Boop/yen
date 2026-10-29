/**
 * Moteur de compatibilité candidat ↔ métier / offre.
 *
 * Principes (cahier des charges §7.B) :
 *  - score entre 0 et 100 = compatibilité ESTIMÉE, jamais une probabilité d'embauche ;
 *  - pondération configurable par YEN (offre > métier > plateforme) ;
 *  - une donnée manquante n'est pas comptée comme zéro en silence : la composante
 *    est exclue, signalée, et la confiance diminue ; un « score plancher » indique
 *    le résultat si toutes les données manquantes valaient zéro ;
 *  - aucune caractéristique sensible n'entre dans le calcul : le type
 *    CandidateEvidence ne contient ni photo, ni sexe, ni origine, ni religion,
 *    ni situation familiale, ni âge ;
 *  - chaque contribution est expliquée pour permettre la révision humaine.
 */
import { LEVEL_RANK, levelLabel, type SkillLevel } from "@/lib/labels";

export type Importance = "obligatoire" | "importante" | "souhaitee";

export interface Weights {
  demonstrated_skills: number;
  assessments: number;
  projects: number;
  education: number;
  experience: number;
}

export const DEFAULT_WEIGHTS: Weights = {
  demonstrated_skills: 40,
  assessments: 25,
  projects: 15,
  education: 10,
  experience: 10,
};

export const WEIGHT_LABELS: Record<keyof Weights, string> = {
  demonstrated_skills: "Compétences techniques démontrées",
  assessments: "Résultats des entretiens",
  projects: "Projets et réalisations",
  education: "Formation et certifications",
  experience: "Expérience pertinente",
};

const IMPORTANCE_FACTOR: Record<Importance, number> = { obligatoire: 3, importante: 2, souhaitee: 1 };

export interface Requirement {
  skillId: string;
  skillName: string;
  requiredLevel: SkillLevel;
  importance: Importance;
}

export interface MatchTarget {
  kind: "occupation" | "offer";
  id: string;
  title: string;
  domainId: string | null;
  requirements: Requirement[];
  /** Rang de niveau d'études attendu (voir educationRank), null si non précisé */
  educationRank: number | null;
  minExperienceMonths: number | null;
  /** Noms de certifications pertinentes (catalogue du domaine) */
  relevantCertifications: string[];
  weights: Weights;
}

export interface EvidenceRef {
  type: "evaluation" | "projet" | "evaluateur" | "retour_partenaire" | "questionnaire" | "exercice" | "cv" | "experience" | "formation" | "certification";
  id: string;
  label: string;
}

export interface DemonstratedSkill {
  level: SkillLevel;
  bestScorePercent: number | null;
  sources: EvidenceRef[];
}

export interface CandidateEvidence {
  candidateId: string;
  primaryDomainId: string | null;
  demonstrated: Record<string, DemonstratedSkill>;
  declared: Record<string, { level: SkillLevel }>;
  /** Scores (0-100) obtenus aux évaluations, par compétence */
  testScores: Record<string, { percent: number; ref: EvidenceRef }[]>;
  projects: { id: string; title: string; skillIds: string[]; verified: boolean }[];
  educationRank: number | null;
  hasEducationData: boolean;
  certifications: { id: string; name: string; verified: boolean }[];
  /** Mois d'expérience pertinente (null = aucune donnée de parcours) */
  relevantExperienceMonths: number | null;
  hasExperienceData: boolean;
}

export interface ComponentResult {
  key: keyof Weights;
  label: string;
  weight: number;
  /** 0..1, ou null si la donnée est indisponible */
  value: number | null;
  explanation: string;
}

export interface RequirementResult {
  skillId: string;
  skillName: string;
  requiredLevel: SkillLevel;
  importance: Importance;
  demonstratedLevel: SkillLevel | null;
  declaredLevel: SkillLevel | null;
  status: "satisfaite" | "partielle" | "declaree_a_confirmer" | "non_demontree";
  evidence: EvidenceRef[];
}

export interface MatchResult {
  targetId: string;
  targetKind: MatchTarget["kind"];
  targetTitle: string;
  /** Estimation sur les données disponibles (0-100) */
  score: number;
  /** Score si toutes les données manquantes valaient zéro (0-100) */
  floorScore: number;
  confidence: number;
  confidenceLabel: "faible" | "moyenne" | "elevee";
  components: ComponentResult[];
  requirements: RequirementResult[];
  meetsMandatory: boolean;
  unmetMandatory: string[];
  strengths: string[];
  gaps: string[];
  missingData: string[];
  disclaimer: string;
}

export const MATCH_DISCLAIMER =
  "Ce score représente une compatibilité estimée à partir des données disponibles. Ce n'est pas une probabilité d'embauche ; la décision finale appartient au responsable d'insertion.";

/** Rang des niveaux d'études usuels (valeurs libres normalisées). */
export function educationRank(level: string | null | undefined): number | null {
  if (!level) return null;
  const s = level.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  if (/doctorat|phd/.test(s)) return 6;
  if (/master|ingenieur|bac\s*\+\s*5|mba/.test(s)) return 5;
  if (/licence|bachelor|bac\s*\+\s*3/.test(s)) return 4;
  if (/bts|dut|bac\s*\+\s*2|deug|technicien superieur/.test(s)) return 3;
  if (/bac|baccalaureat|cap|bep|professionnel|technicien/.test(s)) return 2;
  if (/aucun|primaire|college|bepc/.test(s)) return 1;
  return null;
}

export function normalizeWeights(w: Partial<Weights> | null | undefined, fallback: Weights = DEFAULT_WEIGHTS): Weights {
  if (!w) return fallback;
  const merged: Weights = { ...fallback };
  for (const k of Object.keys(DEFAULT_WEIGHTS) as (keyof Weights)[]) {
    const v = Number((w as Record<string, unknown>)[k]);
    if (Number.isFinite(v) && v >= 0) merged[k] = v;
  }
  const total = Object.values(merged).reduce((a, b) => a + b, 0);
  return total > 0 ? merged : fallback;
}

/** Résout la pondération : offre > métier > plateforme > défaut. */
export function resolveWeights(...candidates: (Partial<Weights> | null | undefined)[]): Weights {
  for (const c of candidates) {
    if (c && Object.keys(c).length > 0) return normalizeWeights(c);
  }
  return DEFAULT_WEIGHTS;
}

const rank = (l: SkillLevel | null | undefined) => (l ? LEVEL_RANK[l] : 0);

export function computeMatch(target: MatchTarget, ev: CandidateEvidence): MatchResult {
  const strengths: string[] = [];
  const gaps: string[] = [];
  const missingData: string[] = [];

  // --- Exigences de compétences -------------------------------------------
  const requirements: RequirementResult[] = target.requirements.map((r) => {
    const dem = ev.demonstrated[r.skillId];
    const dec = ev.declared[r.skillId];
    let status: RequirementResult["status"];
    if (dem && rank(dem.level) >= rank(r.requiredLevel)) status = "satisfaite";
    else if (dem) status = "partielle";
    else if (dec) status = "declaree_a_confirmer";
    else status = "non_demontree";
    return {
      skillId: r.skillId,
      skillName: r.skillName,
      requiredLevel: r.requiredLevel,
      importance: r.importance,
      demonstratedLevel: dem?.level ?? null,
      declaredLevel: dec?.level ?? null,
      status,
      evidence: dem?.sources ?? [],
    };
  });

  const totalImportance = target.requirements.reduce((s, r) => s + IMPORTANCE_FACTOR[r.importance], 0);
  const components: ComponentResult[] = [];

  // 1. Compétences démontrées
  {
    const hasAnyEvidence = Object.keys(ev.demonstrated).length > 0;
    let value: number | null = null;
    let explanation: string;
    if (target.requirements.length === 0) {
      explanation = "Aucune compétence requise n'est définie pour cette cible.";
      missingData.push("Compétences requises non définies");
    } else if (!hasAnyEvidence) {
      explanation = "Aucune compétence n'a encore été démontrée (entretien, projet vérifié ou évaluateur).";
      missingData.push("Aucune compétence démontrée à ce jour");
    } else {
      let acc = 0;
      for (const rr of requirements) {
        const coverage = rr.demonstratedLevel ? Math.min(1, rank(rr.demonstratedLevel) / rank(rr.requiredLevel)) : 0;
        acc += coverage * IMPORTANCE_FACTOR[rr.importance];
      }
      value = acc / totalImportance;
      const satisfied = requirements.filter((x) => x.status === "satisfaite").length;
      explanation = `${satisfied} compétence(s) requise(s) sur ${requirements.length} démontrée(s) au niveau attendu.`;
    }
    components.push({ key: "demonstrated_skills", label: WEIGHT_LABELS.demonstrated_skills, weight: target.weights.demonstrated_skills, value, explanation });
  }

  // 2. Résultats des évaluations
  {
    let value: number | null = null;
    let explanation: string;
    const assessed = target.requirements.filter((r) => (ev.testScores[r.skillId] ?? []).length > 0);
    if (target.requirements.length === 0) {
      explanation = "Aucune compétence requise n'est définie.";
    } else if (assessed.length === 0) {
      explanation = "Aucun entretien passé sur les compétences requises.";
      missingData.push("Pas de résultat d'entretien sur les compétences requises");
    } else {
      let acc = 0;
      let wsum = 0;
      for (const r of assessed) {
        const best = Math.max(...ev.testScores[r.skillId].map((t) => t.percent));
        acc += (best / 100) * IMPORTANCE_FACTOR[r.importance];
        wsum += IMPORTANCE_FACTOR[r.importance];
      }
      value = acc / wsum;
      explanation = `Meilleurs résultats sur ${assessed.length}/${target.requirements.length} compétence(s) évaluée(s) : moyenne pondérée ${(value * 100).toFixed(0)} %.`;
      if (assessed.length < target.requirements.length) {
        missingData.push(`${target.requirements.length - assessed.length} compétence(s) requise(s) jamais évaluée(s)`);
      }
    }
    components.push({ key: "assessments", label: WEIGHT_LABELS.assessments, weight: target.weights.assessments, value, explanation });
  }

  // 3. Projets
  {
    let value: number | null = null;
    let explanation: string;
    if (ev.projects.length === 0) {
      explanation = "Aucun projet documenté.";
      missingData.push("Aucun projet documenté");
    } else if (target.requirements.length === 0) {
      explanation = "Aucune compétence requise n'est définie.";
    } else {
      let acc = 0;
      const linked: string[] = [];
      for (const r of target.requirements) {
        const ps = ev.projects.filter((p) => p.skillIds.includes(r.skillId));
        if (ps.length === 0) continue;
        const credit = ps.some((p) => p.verified) ? 1 : 0.5; // un projet non vérifié compte pour moitié
        acc += credit * IMPORTANCE_FACTOR[r.importance];
        linked.push(r.skillName);
      }
      value = acc / totalImportance;
      const verified = ev.projects.filter((p) => p.verified).length;
      explanation = linked.length
        ? `${ev.projects.length} projet(s) (${verified} vérifié(s)) couvrant : ${linked.join(", ")}. Un projet non vérifié compte pour moitié.`
        : `${ev.projects.length} projet(s) documenté(s), sans lien avec les compétences requises.`;
    }
    components.push({ key: "projects", label: WEIGHT_LABELS.projects, weight: target.weights.projects, value, explanation });
  }

  // 4. Formation et certifications
  {
    let value: number | null = null;
    let explanation: string;
    if (!ev.hasEducationData && ev.certifications.length === 0) {
      explanation = "Formation non renseignée.";
      missingData.push("Formation non renseignée");
    } else {
      const parts: string[] = [];
      let levelFit: number;
      if (target.educationRank == null) {
        levelFit = 1;
        parts.push("aucun niveau d'études exigé");
      } else if (ev.educationRank == null) {
        levelFit = 0.5;
        parts.push("niveau d'études non précisé");
      } else {
        levelFit = Math.min(1, ev.educationRank / target.educationRank);
        parts.push(levelFit >= 1 ? "niveau d'études conforme" : "niveau d'études inférieur à l'attendu");
      }
      const domainFit = target.domainId && ev.primaryDomainId ? (target.domainId === ev.primaryDomainId ? 1 : 0.4) : 0.6;
      if (target.domainId && ev.primaryDomainId === target.domainId) parts.push("domaine principal correspondant");
      const relevantCerts = ev.certifications.filter((c) =>
        target.relevantCertifications.some((rc) => {
          const a = c.name.toLowerCase();
          const b = rc.toLowerCase();
          return a.includes(b) || b.includes(a);
        }),
      );
      const certFit = relevantCerts.length === 0 ? 0 : relevantCerts.some((c) => c.verified) ? 1 : 0.6;
      if (relevantCerts.length) parts.push(`certification(s) pertinente(s) : ${relevantCerts.map((c) => c.name).join(", ")}`);
      value = 0.5 * levelFit + 0.3 * domainFit + 0.2 * certFit;
      explanation = parts.join(" ; ") + ".";
    }
    components.push({ key: "education", label: WEIGHT_LABELS.education, weight: target.weights.education, value, explanation });
  }

  // 5. Expérience
  {
    let value: number | null;
    let explanation: string;
    const required = target.minExperienceMonths ?? 0;
    if (!ev.hasExperienceData) {
      if (required === 0) {
        value = 1;
        explanation = "Aucune expérience exigée.";
      } else {
        value = null;
        explanation = `Parcours non renseigné (${required} mois d'expérience demandés).`;
        missingData.push("Expériences professionnelles non renseignées");
      }
    } else {
      const months = ev.relevantExperienceMonths ?? 0;
      value = required === 0 ? 1 : Math.min(1, months / required);
      explanation = required === 0
        ? `Aucune expérience exigée (${months} mois d'expérience pertinente déclarée).`
        : `${months} mois d'expérience pertinente pour ${required} mois demandés.`;
    }
    components.push({ key: "experience", label: WEIGHT_LABELS.experience, weight: target.weights.experience, value, explanation });
  }

  // --- Agrégation -----------------------------------------------------------
  const totalWeight = components.reduce((s, c) => s + c.weight, 0) || 1;
  const available = components.filter((c) => c.value != null && c.weight > 0);
  const availableWeight = available.reduce((s, c) => s + c.weight, 0);
  const weightedSum = available.reduce((s, c) => s + (c.value as number) * c.weight, 0);
  const score = availableWeight > 0 ? (100 * weightedSum) / availableWeight : 0;
  const floorScore = (100 * weightedSum) / totalWeight;

  // Confiance : part des pondérations disposant de données × part des exigences
  // appuyées par une preuve (non simplement déclarée)
  const evidenceCoverage = target.requirements.length
    ? requirements.filter((r) => r.demonstratedLevel != null).length / target.requirements.length
    : 0;
  const confidence = (availableWeight / totalWeight) * (0.4 + 0.6 * evidenceCoverage);
  const confidenceLabel = confidence >= 0.7 ? "elevee" : confidence >= 0.4 ? "moyenne" : "faible";

  const unmetMandatory = requirements
    .filter((r) => r.importance === "obligatoire" && r.status !== "satisfaite")
    .map((r) => r.skillName);

  for (const r of requirements) {
    if (r.status === "satisfaite") strengths.push(`${r.skillName} démontrée (${levelLabel[r.demonstratedLevel!]})`);
    else if (r.status === "partielle") gaps.push(`${r.skillName} : niveau ${levelLabel[r.demonstratedLevel!]} démontré, ${levelLabel[r.requiredLevel]} attendu`);
    else if (r.status === "declaree_a_confirmer") gaps.push(`${r.skillName} : déclarée (${levelLabel[r.declaredLevel!]}) mais pas encore démontrée`);
    else gaps.push(`${r.skillName} : non démontrée (${levelLabel[r.requiredLevel]} attendu)`);
  }

  return {
    targetId: target.id,
    targetKind: target.kind,
    targetTitle: target.title,
    score: Math.round(score),
    floorScore: Math.round(floorScore),
    confidence: Math.round(confidence * 100) / 100,
    confidenceLabel,
    components,
    requirements,
    meetsMandatory: unmetMandatory.length === 0,
    unmetMandatory,
    strengths,
    gaps,
    missingData: [...new Set(missingData)],
    disclaimer: MATCH_DISCLAIMER,
  };
}

/** Classement explicable : score, puis respect des exigences obligatoires, puis confiance. */
export function rankMatches<T extends { match: MatchResult }>(items: T[]): T[] {
  return [...items].sort(
    (a, b) =>
      b.match.score - a.match.score ||
      Number(b.match.meetsMandatory) - Number(a.match.meetsMandatory) ||
      b.match.confidence - a.match.confidence ||
      b.match.floorScore - a.match.floorScore,
  );
}
