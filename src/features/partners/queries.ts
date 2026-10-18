import "server-only";
import { createAdminClient, createClient } from "@/lib/supabase/server";
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
  const { data: allowed } = await supabase.rpc("partner_can_view_candidate", { p_candidate: candidateId });
  if (allowed !== true) return null;
  const { data: cvAllowed } = await supabase.rpc("partner_can_view_cv", { p_candidate: candidateId });

  const admin = createAdminClient();
  const { data: c } = await admin
    .from("candidate_profiles")
    .select("id, user_id, public_code, headline, summary, education_level, yen_program, availability, opportunity_types, engineering_domains(name)")
    .eq("id", candidateId)
    .single();
  if (!c) return null;
  const [person, sa, declared, projects, exps, edu, certs, langs, cv, attempts] = await Promise.all([
    admin.from("profiles").select("first_name, last_name, city").eq("id", c.user_id).single(),
    admin.from("skill_assessments").select("id, skill_id, level, score_percent, source, status, attempt_id, project_id, assessed_at").eq("candidate_id", candidateId),
    admin.from("candidate_skills").select("skill_id, self_level, skills(name)").eq("candidate_id", candidateId),
    admin.from("candidate_projects").select("title, description, technologies, verification_status, outcomes").eq("candidate_id", candidateId).neq("verification_status", "rejete"),
    admin.from("candidate_experiences").select("title, organization, start_date, end_date, is_current, description").eq("candidate_id", candidateId).order("start_date", { ascending: false }),
    admin.from("candidate_education").select("degree, institution, end_year").eq("candidate_id", candidateId),
    admin.from("candidate_certifications").select("name, issuer, verification_status").eq("candidate_id", candidateId).neq("verification_status", "rejete"),
    admin.from("candidate_languages").select("language, proficiency").eq("candidate_id", candidateId),
    admin.from("candidate_documents").select("id").eq("candidate_id", candidateId).eq("kind", "cv").eq("is_current", true).is("deleted_at", null).maybeSingle(),
    admin.from("assessment_attempts").select("score_percent, passed, graded_at, assessments(title)").eq("candidate_id", candidateId).eq("status", "corrige").order("graded_at", { ascending: false }),
  ]);
  const skillIds = [...new Set((sa.data ?? []).map((s) => s.skill_id))];
  const { data: skillNames } = skillIds.length ? await admin.from("skills").select("id, name").in("id", skillIds) : { data: [] };
  const name = Object.fromEntries((skillNames ?? []).map((s) => [s.id, s.name]));
  const dem = aggregateDemonstrated((sa.data ?? []) as SkillAssessmentRow[]);

  return {
    id: c.id,
    public_code: c.public_code,
    name: `${person.data?.first_name ?? ""} ${person.data?.last_name ?? ""}`.trim(),
    city: person.data?.city ?? null,
    headline: c.headline,
    summary: c.summary,
    domain: (c.engineering_domains as unknown as { name: string } | null)?.name ?? null,
    education_level: c.education_level,
    yen_program: c.yen_program,
    availability: c.availability,
    opportunity_types: c.opportunity_types,
    hasCv: Boolean(cv.data),
    canDownloadCv: cvAllowed === true && Boolean(cv.data),
    demonstrated: Object.entries(dem).map(([id, d]) => ({ skill: name[id] ?? "—", level: d.level, sources: d.sources.map((s) => s.label) })),
    declared: (declared.data ?? []).filter((d) => !dem[d.skill_id]).map((d) => ({ skill: (d.skills as unknown as { name: string } | null)?.name ?? "—", level: d.self_level as SkillLevel })),
    projects: (projects.data ?? []).map((p) => ({ title: p.title, description: p.description, technologies: p.technologies, verified: p.verification_status === "verifie", outcomes: p.outcomes })),
    experiences: exps.data ?? [],
    education: edu.data ?? [],
    certifications: (certs.data ?? []).map((x) => ({ name: x.name, issuer: x.issuer, verified: x.verification_status === "verifie" })),
    languages: langs.data ?? [],
    results: (attempts.data ?? []).map((a) => ({ title: (a.assessments as unknown as { title: string }).title, score: a.score_percent != null ? Number(a.score_percent) : null, passed: a.passed, date: a.graded_at })),
  };
}

/**
 * Identifiants publics YEN des candidats des candidatures listées pour un
 * partenaire. À n'appeler QU'avec des identifiants issus de lignes déjà
 * filtrées par RLS (candidatures visibles par l'organisation).
 */
export async function publicCodesForVisibleApplications(candidateIds: string[]): Promise<Map<string, string>> {
  const ids = [...new Set(candidateIds)];
  if (!ids.length) return new Map();
  const { data } = await createAdminClient().from("candidate_profiles").select("id, public_code").in("id", ids);
  return new Map((data ?? []).map((c) => [c.id, c.public_code]));
}
