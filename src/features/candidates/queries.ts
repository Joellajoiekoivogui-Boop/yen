import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { SkillLevel } from "@/lib/labels";
import { computeCompletion } from "./completion";
import type { SkillAssessmentRow } from "./skills";

export interface CandidateBundle {
  candidate: {
    id: string; user_id: string; public_code: string; institution: string | null; yen_program: string | null; education_level: string | null;
    graduation_year: number | null; status: "etudiant" | "diplome" | "stagiaire" | "en_recherche"; primary_domain_id: string | null; interest_area: string | null;
    availability: "immediate" | "moins_1_mois" | "un_a_trois_mois" | "plus_tard" | "indisponible"; opportunity_types: string[]; headline: string | null; summary: string | null;
    linkedin_url: string | null; portfolio_url: string | null; github_url: string | null; pipeline_status: string; assigned_manager_id: string | null;
    review_flag: boolean; review_flag_reason: string | null; is_demo: boolean; last_activity_at: string; created_at: string;
    engineering_domains: { name: string; slug: string } | null;
  };
  person: { first_name: string; last_name: string; email: string; phone: string | null; city: string | null; country: string } | null;
  education: { id: string; institution: string; degree: string; field_of_study: string | null; start_year: number | null; end_year: number | null; is_yen_program: boolean; description: string | null; source: string }[];
  experiences: { id: string; title: string; organization: string; experience_type: string; city: string | null; start_date: string; end_date: string | null; is_current: boolean; description: string | null; achievements: string | null; domain_id: string | null; source: string }[];
  projects: { id: string; title: string; description: string; role: string | null; technologies: string[]; outcomes: string | null; project_url: string | null; repository_url: string | null; start_date: string | null; end_date: string | null; domain_id: string | null; verification_status: string; verification_note: string | null; project_skills: { skill_id: string; skills: { name: string } | null }[] }[];
  certifications: { id: string; name: string; issuer: string; issue_date: string | null; expiry_date: string | null; credential_id: string | null; credential_url: string | null; verification_status: string }[];
  declaredSkills: { id: string; skill_id: string; self_level: SkillLevel; years_experience: number | null; evidence_note: string | null; source: string; skills: { name: string; domain_id: string | null; slug: string } | null }[];
  languages: { id: string; language: string; proficiency: string }[];
  consents: Record<string, boolean>;
  currentCv: { id: string; original_filename: string; size_bytes: number; version: number; created_at: string; scan_status: string; text_extraction_status: string; page_count: number | null } | null;
  skillAssessments: (SkillAssessmentRow & { confidence: string; notes: string | null; skills: { name: string; domain_id: string | null } | null })[];
}

/** Charge l'ensemble du dossier d'un candidat avec le client fourni (RLS appliqué si client utilisateur). */
export async function loadCandidateBundle(supabase: SupabaseClient, candidateId: string): Promise<CandidateBundle | null> {
  const { data: candidate } = await supabase
    .from("candidate_profiles")
    .select("*, engineering_domains(name, slug)")
    .eq("id", candidateId)
    .maybeSingle();
  if (!candidate) return null;

  const [person, education, experiences, projects, certifications, declaredSkills, languages, consents, cv, sa] = await Promise.all([
    supabase.from("profiles").select("first_name, last_name, email, phone, city, country").eq("id", candidate.user_id).maybeSingle(),
    supabase.from("candidate_education").select("*").eq("candidate_id", candidateId).order("end_year", { ascending: false, nullsFirst: true }),
    supabase.from("candidate_experiences").select("*").eq("candidate_id", candidateId).order("start_date", { ascending: false }),
    supabase.from("candidate_projects").select("*, project_skills(skill_id, skills(name))").eq("candidate_id", candidateId).order("created_at", { ascending: false }),
    supabase.from("candidate_certifications").select("*").eq("candidate_id", candidateId).order("issue_date", { ascending: false, nullsFirst: false }),
    supabase.from("candidate_skills").select("*, skills(name, domain_id, slug)").eq("candidate_id", candidateId).order("created_at"),
    supabase.from("candidate_languages").select("*").eq("candidate_id", candidateId),
    supabase.from("candidate_consents").select("consent_type, granted").eq("candidate_id", candidateId),
    supabase.from("candidate_documents").select("id, original_filename, size_bytes, version, created_at, scan_status, text_extraction_status, page_count")
      .eq("candidate_id", candidateId).eq("kind", "cv").eq("is_current", true).is("deleted_at", null).maybeSingle(),
    supabase.from("skill_assessments").select("*, skills(name, domain_id)").eq("candidate_id", candidateId).order("assessed_at", { ascending: false }),
  ]);

  return {
    candidate: candidate as CandidateBundle["candidate"],
    person: person.data ?? null,
    education: (education.data ?? []) as CandidateBundle["education"],
    experiences: (experiences.data ?? []) as CandidateBundle["experiences"],
    projects: (projects.data ?? []) as CandidateBundle["projects"],
    certifications: (certifications.data ?? []) as CandidateBundle["certifications"],
    declaredSkills: (declaredSkills.data ?? []) as CandidateBundle["declaredSkills"],
    languages: (languages.data ?? []) as CandidateBundle["languages"],
    consents: Object.fromEntries((consents.data ?? []).map((c) => [c.consent_type, c.granted])),
    currentCv: (cv.data ?? null) as CandidateBundle["currentCv"],
    skillAssessments: (sa.data ?? []) as CandidateBundle["skillAssessments"],
  };
}

export function completionOf(b: CandidateBundle) {
  return computeCompletion({
    firstName: b.person?.first_name ?? "",
    lastName: b.person?.last_name ?? "",
    city: b.person?.city ?? null,
    institution: b.candidate.institution,
    yenProgram: b.candidate.yen_program,
    educationLevel: b.candidate.education_level,
    primaryDomainId: b.candidate.primary_domain_id,
    opportunityTypes: b.candidate.opportunity_types,
    headline: b.candidate.headline,
    summary: b.candidate.summary,
    hasCurrentCv: Boolean(b.currentCv),
    declaredSkillsCount: b.declaredSkills.length,
    educationCount: b.education.length,
    experienceOrProjectCount: b.experiences.length + b.projects.length,
    consentsAnswered: Object.keys(b.consents).filter((k) => k !== "conditions_utilisation").length,
  });
}
