import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { aggregateDemonstrated, experienceMonths, type SkillAssessmentRow } from "@/features/candidates/skills";
import { getDefaultWeights } from "@/features/admin/settings";
import type { SkillLevel } from "@/lib/labels";
import { educationRank, resolveWeights, type CandidateEvidence, type Importance, type MatchTarget, type Weights } from "./engine";

const CHUNK = 200;

/** Construit les preuves de plusieurs candidats en un nombre constant de requêtes. */
export async function loadEvidenceBatch(supabase: SupabaseClient, candidateIds: string[], targetDomainId: string | null = null): Promise<Map<string, CandidateEvidence>> {
  const out = new Map<string, CandidateEvidence>();
  for (let i = 0; i < candidateIds.length; i += CHUNK) {
    const ids = candidateIds.slice(i, i + CHUNK);
    const [cands, sa, declared, projects, education, experiences, certs] = await Promise.all([
      supabase.from("candidate_profiles").select("id, primary_domain_id, education_level").in("id", ids),
      supabase.from("skill_assessments").select("id, candidate_id, skill_id, level, score_percent, source, status, attempt_id, project_id, assessed_at").in("candidate_id", ids),
      supabase.from("candidate_skills").select("candidate_id, skill_id, self_level").in("candidate_id", ids),
      supabase.from("candidate_projects").select("id, candidate_id, title, verification_status, project_skills(skill_id)").in("candidate_id", ids),
      supabase.from("candidate_education").select("candidate_id").in("candidate_id", ids),
      supabase.from("candidate_experiences").select("candidate_id, start_date, end_date, is_current, domain_id, experience_type").in("candidate_id", ids),
      supabase.from("candidate_certifications").select("id, candidate_id, name, verification_status").in("candidate_id", ids),
    ]);

    for (const c of cands.data ?? []) {
      const saRows = (sa.data ?? []).filter((r) => r.candidate_id === c.id) as SkillAssessmentRow[];
      const testScores: CandidateEvidence["testScores"] = {};
      for (const r of saRows) {
        if (r.status !== "valide" || r.score_percent == null || !(r.source === "questionnaire" || r.source === "exercice")) continue;
        (testScores[r.skill_id] ??= []).push({ percent: Number(r.score_percent), ref: { type: r.source, id: r.attempt_id ?? r.id, label: "Entretien" } });
      }
      const exps = (experiences.data ?? []).filter((e) => e.candidate_id === c.id && e.experience_type !== "projet_academique");
      const relevant = targetDomainId ? exps.filter((e) => !e.domain_id || e.domain_id === targetDomainId) : exps;
      const hasEdu = (education.data ?? []).some((e) => e.candidate_id === c.id) || Boolean(c.education_level);
      out.set(c.id, {
        candidateId: c.id,
        primaryDomainId: c.primary_domain_id,
        demonstrated: aggregateDemonstrated(saRows),
        declared: Object.fromEntries((declared.data ?? []).filter((d) => d.candidate_id === c.id).map((d) => [d.skill_id, { level: d.self_level as SkillLevel }])),
        testScores,
        projects: (projects.data ?? []).filter((p) => p.candidate_id === c.id).map((p) => ({
          id: p.id, title: p.title, verified: p.verification_status === "verifie",
          skillIds: ((p.project_skills ?? []) as { skill_id: string }[]).map((s) => s.skill_id),
        })),
        educationRank: educationRank(c.education_level),
        hasEducationData: hasEdu,
        certifications: (certs.data ?? []).filter((x) => x.candidate_id === c.id && x.verification_status !== "rejete").map((x) => ({ id: x.id, name: x.name, verified: x.verification_status === "verifie" })),
        relevantExperienceMonths: exps.length ? experienceMonths(relevant) : null,
        hasExperienceData: exps.length > 0,
      });
    }
  }
  return out;
}

export async function loadEvidence(supabase: SupabaseClient, candidateId: string, targetDomainId: string | null = null): Promise<CandidateEvidence | null> {
  return (await loadEvidenceBatch(supabase, [candidateId], targetDomainId)).get(candidateId) ?? null;
}

interface ReqRow { skill_id: string; required_level: SkillLevel; skills: { name: string } | null }

/** Cibles « métier » (un ou plusieurs domaines). */
export async function loadOccupationTargets(supabase: SupabaseClient, opts: { domainIds?: string[]; occupationIds?: string[] } = {}): Promise<MatchTarget[]> {
  let q = supabase
    .from("occupations")
    .select("id, title, domain_id, typical_education, scoring_weights, occupation_skills(skill_id, required_level, importance, skills(name)), engineering_domains(certifications)")
    .eq("is_active", true);
  if (opts.domainIds?.length) q = q.in("domain_id", opts.domainIds);
  if (opts.occupationIds?.length) q = q.in("id", opts.occupationIds);
  const [{ data }, platform] = await Promise.all([q, getDefaultWeights()]);
  return (data ?? []).map((o) => ({
    kind: "occupation" as const,
    id: o.id,
    title: o.title,
    domainId: o.domain_id,
    requirements: ((o.occupation_skills ?? []) as unknown as (ReqRow & { importance: Importance })[]).map((r) => ({
      skillId: r.skill_id, skillName: r.skills?.name ?? "Compétence", requiredLevel: r.required_level, importance: r.importance,
    })),
    educationRank: educationRank(o.typical_education),
    minExperienceMonths: 0,
    relevantCertifications: ((o.engineering_domains as unknown as { certifications: string[] } | null)?.certifications) ?? [],
    weights: resolveWeights(o.scoring_weights as Partial<Weights> | null, platform),
  }));
}

const OFFER_SELECT =
  "id, title, domain_id, education_level, min_experience_months, scoring_weights, occupations(scoring_weights), engineering_domains(certifications), job_required_skills(skill_id, required_level, is_mandatory, skills(name))";

/** Cible « offre » : pondération offre > métier associé > plateforme. */
export async function loadOfferTarget(supabase: SupabaseClient, offerId: string): Promise<MatchTarget | null> {
  return (await loadOfferTargets(supabase, [offerId]))[0] ?? null;
}

export async function loadOfferTargets(supabase: SupabaseClient, offerIds: string[]): Promise<MatchTarget[]> {
  if (!offerIds.length) return [];
  const [{ data }, platform] = await Promise.all([supabase.from("job_offers").select(OFFER_SELECT).in("id", offerIds), getDefaultWeights()]);
  return (data ?? []).map((o) => offerToTarget(o, platform));
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function offerToTarget(o: any, platform: Weights): MatchTarget {
  return {
    kind: "offer",
    id: o.id,
    title: o.title,
    domainId: o.domain_id,
    requirements: ((o.job_required_skills ?? []) as unknown as (ReqRow & { is_mandatory: boolean })[]).map((r) => ({
      skillId: r.skill_id, skillName: r.skills?.name ?? "Compétence", requiredLevel: r.required_level, importance: r.is_mandatory ? "obligatoire" : "importante",
    })),
    educationRank: educationRank(o.education_level),
    minExperienceMonths: o.min_experience_months ?? 0,
    relevantCertifications: ((o.engineering_domains as unknown as { certifications: string[] } | null)?.certifications) ?? [],
    weights: resolveWeights(
      o.scoring_weights as Partial<Weights> | null,
      (o.occupations as unknown as { scoring_weights: Partial<Weights> | null } | null)?.scoring_weights,
      platform,
    ),
  };
}
