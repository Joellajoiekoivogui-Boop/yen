import "server-only";
import { createClient } from "@/lib/supabase/server";
import { aggregateDemonstrated, type SkillAssessmentRow } from "@/features/candidates/skills";
import type { SkillLevel } from "@/lib/labels";

export interface PartnerCandidateView {
  id: string;
  public_code: string;
  name: string;
  city: string | null;
  headline: string | null;
  summary: string | null;
  domain: string | null;
  education_level: string | null;
  yen_program: string | null;
  availability: string;
  opportunity_types: string[];
  hasCv: boolean;
  canDownloadCv: boolean;
  demonstrated: { skill: string; level: SkillLevel; sources: string[] }[];
  declared: { skill: string; level: SkillLevel }[];
  projects: { title: string; description: string; technologies: string[]; verified: boolean; outcomes: string | null }[];
  experiences: { title: string; organization: string; start_date: string; end_date: string | null; is_current: boolean; description: string | null }[];
  education: { degree: string; institution: string; end_year: number | null }[];
  certifications: { name: string; issuer: string; verified: boolean }[];
  languages: { language: string; proficiency: string }[];
  results: { title: string; score: number | null; passed: boolean | null; date: string | null }[];
}

/**
 * Vue restreinte d'un candidat pour un partenaire. L'autorisation est d'abord
 * vérifiée AVEC L'IDENTITÉ DU PARTENAIRE (fonction SQL partner_can_view_candidate) ;
 * seules des colonnes professionnelles explicitement listées sont ensuite lues.
 * Jamais : e-mail, téléphone, notes internes, analyses IA, données de suivi YEN.
 */
export async function loadPartnerCandidateView(candidateId: string): Promise<PartnerCandidateView | null> {
  const supabase = await createClient();
  // partner_candidate_data vérifie l'accès (partner_can_view_candidate) puis ne renvoie que des champs professionnels
  const { data, error } = await supabase.rpc("partner_candidate_data", { p_candidate: candidateId });
  if (error || !data) return null;
  const d = data as {
    id: string; public_code: string; headline: string | null; summary: string | null; education_level: string | null; yen_program: string | null;
    availability: string; opportunity_types: string[]; domain: string | null; first_name: string; last_name: string; city: string | null;
    skill_assessments: (SkillAssessmentRow & { skill_name: string })[];
    declared: { skill_id: string; self_level: SkillLevel; name: string }[];
    projects: { title: string; description: string; technologies: string[]; verification_status: string; outcomes: string | null }[];
    experiences: PartnerCandidateView["experiences"];
    education: PartnerCandidateView["education"];
    certifications: { name: string; issuer: string; verification_status: string }[];
    languages: PartnerCandidateView["languages"];
    has_cv: boolean; can_download_cv: boolean;
    results: { title: string; score_percent: number | string | null; passed: boolean | null; graded_at: string | null }[];
  };
  const name = Object.fromEntries(d.skill_assessments.map((s) => [s.skill_id, s.skill_name]));
  const dem = aggregateDemonstrated(d.skill_assessments.map((s) => ({ ...s, score_percent: s.score_percent != null ? Number(s.score_percent) : null })));

  return {
    id: d.id,
    public_code: d.public_code,
    name: `${d.first_name ?? ""} ${d.last_name ?? ""}`.trim(),
    city: d.city,
    headline: d.headline,
    summary: d.summary,
    domain: d.domain,
    education_level: d.education_level,
    yen_program: d.yen_program,
    availability: d.availability,
    opportunity_types: d.opportunity_types ?? [],
    hasCv: d.has_cv,
    canDownloadCv: d.can_download_cv && d.has_cv,
    demonstrated: Object.entries(dem).map(([id, x]) => ({ skill: name[id] ?? "—", level: x.level, sources: x.sources.map((s) => s.label) })),
    declared: d.declared.filter((x) => !dem[x.skill_id]).map((x) => ({ skill: x.name ?? "—", level: x.self_level })),
    projects: d.projects.map((p) => ({ title: p.title, description: p.description, technologies: p.technologies ?? [], verified: p.verification_status === "verifie", outcomes: p.outcomes })),
    experiences: d.experiences,
    education: d.education,
    certifications: d.certifications.map((x) => ({ name: x.name, issuer: x.issuer, verified: x.verification_status === "verifie" })),
    languages: d.languages,
    results: d.results.map((r) => ({ title: r.title, score: r.score_percent != null ? Number(r.score_percent) : null, passed: r.passed, date: r.graded_at })),
  };
}

/** Identifiants publics YEN des candidats que l'organisation du partenaire peut consulter. */
export async function publicCodesForVisibleApplications(candidateIds: string[]): Promise<Map<string, string>> {
  const ids = [...new Set(candidateIds)];
  if (!ids.length) return new Map();
  const supabase = await createClient();
  const { data } = await supabase.rpc("partner_candidate_codes", { p_ids: ids });
  return new Map(((data ?? []) as { id: string; public_code: string }[]).map((c) => [c.id, c.public_code]));
}
