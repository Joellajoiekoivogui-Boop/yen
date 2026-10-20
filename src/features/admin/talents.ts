import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { computeCompletion } from "@/features/candidates/completion";
import { computeMatch, rankMatches, type MatchResult, type MatchTarget } from "@/features/matching/engine";
import { loadEvidenceBatch, loadOccupationTargets } from "@/features/matching/loader";
import { LEVEL_RANK, SKILL_LEVELS, type SkillLevel } from "@/lib/labels";

export interface TalentFilters {
  q?: string;
  domain?: string;
  skill?: string;
  minLevel?: SkillLevel;
  program?: string;
  gradYear?: number;
  city?: string;
  availability?: string;
  opportunity?: string;
  minScore?: number;
  pipeline?: string;
  flagged?: boolean;
  includeDemo?: boolean;
  sort?: "activite" | "inscription" | "identifiant" | "diplomation";
  page: number;
  pageSize: number;
}

export interface TalentRow {
  id: string;
  public_code: string;
  name: string;
  phone: string | null;
  city: string | null;
  yen_program: string | null;
  domain: string | null;
  graduation_year: number | null;
  availability: string;
  pipeline_status: string;
  review_flag: boolean;
  is_demo: boolean;
  last_activity_at: string;
  evaluatedSkills: number;
  projects: number;
  completion: number;
  bestOccupation: { title: string; score: number } | null;
}

/**
 * Répertoire des talents : filtres combinables, pagination et tri côté base.
 * Les filtres sur les compétences et les résultats sont résolus en listes
 * d'identifiants avant la requête principale.
 */
export async function searchTalents(supabase: SupabaseClient, f: TalentFilters): Promise<{ rows: TalentRow[]; total: number }> {
  let restrict: Set<string> | null = null;
  const intersect = (ids: string[]) => {
    const s = new Set(ids);
    restrict = restrict ? new Set([...restrict].filter((x) => s.has(x))) : s;
  };

  if (f.skill) {
    const levels = f.minLevel ? SKILL_LEVELS.filter((l) => LEVEL_RANK[l] >= LEVEL_RANK[f.minLevel!]) : SKILL_LEVELS;
    const { data } = await supabase.from("skill_assessments").select("candidate_id").eq("skill_id", f.skill).eq("status", "valide").in("level", levels);
    intersect((data ?? []).map((r) => r.candidate_id));
  } else if (f.minLevel) {
    const levels = SKILL_LEVELS.filter((l) => LEVEL_RANK[l] >= LEVEL_RANK[f.minLevel!]);
    const { data } = await supabase.from("skill_assessments").select("candidate_id").eq("status", "valide").in("level", levels);
    intersect((data ?? []).map((r) => r.candidate_id));
  }
  if (f.minScore != null) {
    const { data } = await supabase.from("assessment_attempts").select("candidate_id").eq("status", "corrige").gte("score_percent", f.minScore);
    intersect((data ?? []).map((r) => r.candidate_id));
  }
  if (restrict && (restrict as Set<string>).size === 0) return { rows: [], total: 0 };

  let q = supabase
    .from("candidate_profiles")
    .select("id, public_code, yen_program, graduation_year, availability, pipeline_status, review_flag, is_demo, last_activity_at, primary_domain_id, education_level, institution, opportunity_types, headline, summary, engineering_domains(name), profiles!candidate_profiles_user_id_fkey!inner(first_name, last_name, city, phone, is_active)", { count: "exact" });
  if (!f.includeDemo) q = q.eq("is_demo", false);
  if (f.domain) q = q.eq("primary_domain_id", f.domain);
  if (f.program) q = q.ilike("yen_program", `%${f.program}%`);
  if (f.gradYear) q = q.eq("graduation_year", f.gradYear);
  if (f.city) q = q.ilike("profiles.city", `%${f.city}%`);
  if (f.availability) q = q.eq("availability", f.availability);
  if (f.opportunity) q = q.contains("opportunity_types", [f.opportunity]);
  if (f.pipeline) q = q.eq("pipeline_status", f.pipeline);
  if (f.flagged) q = q.eq("review_flag", true);
  if (f.q) {
    const term = f.q.replace(/[%_,()*]/g, "").trim();
    if (/^yen-cb/i.test(term)) q = q.ilike("public_code", `%${term}%`);
    else if (/^\+?[\d .-]{6,}$/.test(term)) q = q.ilike("profiles.phone", `%${term}%`);
    else if (term) q = q.or(`first_name.ilike.%${term}%,last_name.ilike.%${term}%`, { referencedTable: "profiles" });
  }
  if (restrict) q = q.in("id", [...(restrict as Set<string>)].slice(0, 1000));
  const sortCol = { activite: "last_activity_at", inscription: "created_at", identifiant: "public_code", diplomation: "graduation_year" }[f.sort ?? "activite"];
  q = q.order(sortCol, { ascending: f.sort === "identifiant", nullsFirst: false }).range((f.page - 1) * f.pageSize, f.page * f.pageSize - 1);

  const { data, count, error } = await q;
  if (error) throw new Error("Recherche impossible");
  const list = data ?? [];
  const ids = list.map((c) => c.id);
  if (!ids.length) return { rows: [], total: count ?? 0 };

  const [skills, sa, projects, edu, exps, cvs, consents, evidence, targets] = await Promise.all([
    supabase.from("candidate_skills").select("candidate_id").in("candidate_id", ids),
    supabase.from("skill_assessments").select("candidate_id, skill_id").in("candidate_id", ids).eq("status", "valide"),
    supabase.from("candidate_projects").select("candidate_id").in("candidate_id", ids),
    supabase.from("candidate_education").select("candidate_id").in("candidate_id", ids),
    supabase.from("candidate_experiences").select("candidate_id").in("candidate_id", ids),
    supabase.from("candidate_documents").select("candidate_id").in("candidate_id", ids).eq("kind", "cv").eq("is_current", true).is("deleted_at", null),
    supabase.from("candidate_consents").select("candidate_id, consent_type").in("candidate_id", ids).neq("consent_type", "conditions_utilisation"),
    loadEvidenceBatch(supabase, ids),
    loadOccupationTargets(supabase, { domainIds: [...new Set(list.map((c) => c.primary_domain_id).filter(Boolean) as string[])] }),
  ]);
  const countBy = (rows: { candidate_id: string }[] | null, id: string) => (rows ?? []).filter((r) => r.candidate_id === id).length;

  const rows: TalentRow[] = list.map((c) => {
    const p = c.profiles as unknown as { first_name: string; last_name: string; city: string | null; phone: string | null };
    const nProjects = countBy(projects.data, c.id);
    const completion = computeCompletion({
      firstName: p.first_name, lastName: p.last_name, city: p.city, institution: c.institution, yenProgram: c.yen_program, educationLevel: c.education_level,
      primaryDomainId: c.primary_domain_id, opportunityTypes: c.opportunity_types, headline: c.headline, summary: c.summary,
      hasCurrentCv: countBy(cvs.data, c.id) > 0, declaredSkillsCount: countBy(skills.data, c.id), educationCount: countBy(edu.data, c.id),
      experienceOrProjectCount: countBy(exps.data, c.id) + nProjects, consentsAnswered: countBy(consents.data, c.id),
    }).percent;
    const ev = evidence.get(c.id);
    const domainTargets = targets.filter((t) => t.domainId === c.primary_domain_id);
    const best = ev && domainTargets.length ? rankMatches(domainTargets.map((t) => ({ target: t, match: computeMatch(t, ev) })))[0] : null;
    return {
      id: c.id, public_code: c.public_code, name: `${p.first_name} ${p.last_name}`.trim() || "—", phone: p.phone, city: p.city, yen_program: c.yen_program,
      domain: (c.engineering_domains as unknown as { name: string } | null)?.name ?? null, graduation_year: c.graduation_year, availability: c.availability,
      pipeline_status: c.pipeline_status, review_flag: c.review_flag, is_demo: c.is_demo, last_activity_at: c.last_activity_at,
      evaluatedSkills: new Set((sa.data ?? []).filter((r) => r.candidate_id === c.id).map((r) => r.skill_id)).size,
      projects: nProjects, completion, bestOccupation: best ? { title: best.target.title, score: best.match.score } : null,
    };
  });
  return { rows, total: count ?? 0 };
}

export interface RankedCandidate {
  candidateId: string;
  publicCode: string;
  name: string;
  isDemo: boolean;
  applicationStatus: string | null;
  applied: boolean;
  consentPool: boolean;
  consentShare: boolean;
  match: MatchResult;
}

/**
 * Classement intelligent pour une offre ou un métier : vivier = candidats ayant
 * consenti à la visibilité dans le vivier, plus ceux qui ont postulé à l'offre.
 * Le classement est une aide à la décision, jamais une décision automatique.
 */
export async function rankCandidatesFor(supabase: SupabaseClient, target: MatchTarget, opts: { offerId?: string; includeDemo?: boolean; limit?: number } = {}): Promise<RankedCandidate[]> {
  const [pool, apps] = await Promise.all([
    supabase.from("candidate_consents").select("candidate_id").eq("consent_type", "visibilite_vivier").eq("granted", true),
    opts.offerId ? supabase.from("applications").select("candidate_id, status, origin").eq("offer_id", opts.offerId) : Promise.resolve({ data: [] as { candidate_id: string; status: string; origin: string }[] }),
  ]);
  const poolIds = new Set((pool.data ?? []).map((r) => r.candidate_id));
  const appMap = new Map((apps.data ?? []).map((a) => [a.candidate_id, a]));
  let ids = [...new Set([...poolIds, ...appMap.keys()])];
  if (!ids.length) return [];

  // Pré-filtre : candidats ayant au moins une compétence requise (déclarée ou démontrée) ou ayant postulé
  const reqSkills = target.requirements.map((r) => r.skillId);
  if (reqSkills.length) {
    const [d1, d2] = await Promise.all([
      supabase.from("candidate_skills").select("candidate_id").in("skill_id", reqSkills).in("candidate_id", ids.slice(0, 1000)),
      supabase.from("skill_assessments").select("candidate_id").in("skill_id", reqSkills).in("candidate_id", ids.slice(0, 1000)),
    ]);
    const relevant = new Set([...(d1.data ?? []), ...(d2.data ?? [])].map((r) => r.candidate_id));
    ids = ids.filter((id) => relevant.has(id) || appMap.has(id));
  }
  ids = ids.slice(0, opts.limit ?? 400);
  const { data: cands } = await supabase
    .from("candidate_profiles")
    .select("id, public_code, is_demo, profiles!candidate_profiles_user_id_fkey(first_name, last_name, is_active)")
    .in("id", ids);
  const active = (cands ?? []).filter((c) => (c.profiles as unknown as { is_active: boolean } | null)?.is_active && (opts.includeDemo || !c.is_demo));
  const shareConsents = await supabase.from("candidate_consents").select("candidate_id").eq("consent_type", "partage_partenaires").eq("granted", true).in("candidate_id", active.map((c) => c.id));
  const shareSet = new Set((shareConsents.data ?? []).map((r) => r.candidate_id));
  const evidence = await loadEvidenceBatch(supabase, active.map((c) => c.id), target.domainId);

  return rankMatches(
    active.flatMap((c) => {
      const ev = evidence.get(c.id);
      if (!ev) return [];
      const p = c.profiles as unknown as { first_name: string; last_name: string };
      const app = appMap.get(c.id);
      return [{
        candidateId: c.id, publicCode: c.public_code, name: `${p.first_name} ${p.last_name}`.trim(), isDemo: c.is_demo,
        applicationStatus: app?.status ?? null, applied: app?.origin === "candidat", consentPool: poolIds.has(c.id), consentShare: shareSet.has(c.id),
        match: computeMatch(target, ev),
      }];
    }),
  );
}
