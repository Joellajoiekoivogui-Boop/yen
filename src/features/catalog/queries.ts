import "server-only";
import { isSupabaseConfigured } from "@/lib/env";
import { unstable_cache } from "next/cache";
import { createPublicClient } from "@/lib/supabase/public";
import { domains as seedDomains, transversalSkills } from "../../../supabase/seed-data/catalog";
import type { SkillLevel } from "@/lib/labels";

export interface DomainSummary {
  id: string;
  slug: string;
  name: string;
  short_description: string;
  icon: string;
  skillCount: number;
  occupationCount: number;
}

export interface DomainDetail extends DomainSummary {
  description: string;
  tools: string[];
  certifications: string[];
  project_types: string[];
  progression_criteria: string;
  skills: { id: string; slug: string; name: string; tier: "fondamentale" | "avancee"; category: string; level_criteria: Record<SkillLevel, string> }[];
  occupations: { id: string; slug: string; title: string; description: string; typical_education: string; skills: { name: string; required_level: SkillLevel; importance: string }[] }[];
  assessments: { id: string; title: string; level: SkillLevel; duration_minutes: number; description: string }[];
  source: "database" | "reference";
}

/** Domaines actifs. Si Supabase n'est pas configuré, le catalogue de référence est utilisé (données réelles du catalogue, pas des données fictives). */
/** Catalogue de référence (identique à celui de la base, identifiants = slugs) : affichage seulement. */
export function referenceDomains(): DomainSummary[] {
  return seedDomains.map((d) => ({
    id: d.slug, slug: d.slug, name: d.name, short_description: d.short, icon: d.icon, skillCount: d.skills.length, occupationCount: d.occupations.length,
  }));
}

async function fetchDomains(): Promise<DomainSummary[]> {
  if (!isSupabaseConfigured()) return referenceDomains();
  const supabase = createPublicClient();
  const { data, error } = await supabase
    .from("engineering_domains")
    .select("id, slug, name, short_description, icon, skills(count), occupations(count)")
    .eq("is_active", true)
    .order("position");
  // une erreur n'est jamais mise en cache : l'appelant choisit le repli (catalogue de référence pour l'affichage)
  if (error) throw new Error(`Domaines indisponibles : ${error.message}`);
  return (data ?? []).map((d) => ({
    id: d.id, slug: d.slug, name: d.name, short_description: d.short_description, icon: d.icon,
    skillCount: (d.skills as unknown as { count: number }[])[0]?.count ?? 0,
    occupationCount: (d.occupations as unknown as { count: number }[])[0]?.count ?? 0,
  }));
}

/** Fiche de référence d'un domaine (affichage seulement, base injoignable ou non configurée). */
export function referenceDomain(slug: string): DomainDetail | null {
  const d = seedDomains.find((x) => x.slug === slug);
  if (!d) return null;
  const allSkills = [...transversalSkills, ...seedDomains.flatMap((x) => x.skills)];
  return {
    id: d.slug, slug: d.slug, name: d.name, short_description: d.short, icon: d.icon, description: d.description, tools: d.tools,
    certifications: d.certifications, project_types: d.projectTypes, progression_criteria: d.progression,
    skillCount: d.skills.length, occupationCount: d.occupations.length, source: "reference",
    skills: d.skills.map((s) => ({
      id: s.slug, slug: s.slug, name: s.name, tier: s.tier, category: s.category ?? "technique",
      level_criteria: { debutant: s.criteria[0], intermediaire: s.criteria[1], avance: s.criteria[2], expert: s.criteria[3] },
    })),
    occupations: d.occupations.map((o) => ({
      id: o.slug, slug: o.slug, title: o.title, description: o.description, typical_education: o.education,
      skills: o.skills.map(([sl, level, importance]) => ({ name: allSkills.find((s) => s.slug === sl)?.name ?? sl, required_level: level, importance })),
    })),
    assessments: d.assessments.map((a) => ({ id: a.slug, title: a.title, level: a.level, duration_minutes: a.duration, description: a.description })),
  };
}

async function fetchDomain(slug: string): Promise<DomainDetail | null> {
  if (!isSupabaseConfigured()) return referenceDomain(slug);
  const supabase = createPublicClient();
  const { data: d, error } = await supabase
    .from("engineering_domains")
    .select("id, slug, name, short_description, description, icon, tools, certifications, project_types, progression_criteria")
    .eq("slug", slug)
    .eq("is_active", true)
    .maybeSingle();
  // une erreur n'est pas un « introuvable » : la version déjà en cache reste servie
  if (error) throw new Error("Impossible de charger le domaine");
  if (!d) return null;
  const [skills, occupations, assessments] = await Promise.all([
    supabase.from("skills").select("id, slug, name, tier, category, level_criteria").eq("domain_id", d.id).eq("is_active", true).order("tier").order("name"),
    supabase.from("occupations").select("id, slug, title, description, typical_education, occupation_skills(required_level, importance, skills(name))").eq("domain_id", d.id).eq("is_active", true).order("title"),
    supabase.from("assessments").select("id, title, level, duration_minutes, description").eq("domain_id", d.id).eq("status", "publie").order("level"),
  ]);
  return {
    ...d,
    skillCount: skills.data?.length ?? 0,
    occupationCount: occupations.data?.length ?? 0,
    skills: (skills.data ?? []) as DomainDetail["skills"],
    occupations: (occupations.data ?? []).map((o) => ({
      id: o.id, slug: o.slug, title: o.title, description: o.description, typical_education: o.typical_education,
      skills: ((o.occupation_skills ?? []) as unknown as { required_level: SkillLevel; importance: string; skills: { name: string } | null }[]).map((s) => ({
        name: s.skills?.name ?? "—", required_level: s.required_level, importance: s.importance,
      })),
    })),
    assessments: (assessments.data ?? []) as DomainDetail["assessments"],
    source: "database",
  };
}

// Données publiques mises en cache une heure (pages publiques rendues à chaque requête pour leur nonce de sécurité) ;
// invalidées par les actions d'administration du catalogue (étiquette « catalogue »).
const CACHE = { revalidate: 3600, tags: ["catalogue"] };

/** Domaines actifs (cache d'une heure). */
export const listDomains = unstable_cache(fetchDomains, ["catalogue-domaines-v2"], CACHE);

/** Fiche d'un domaine (cache d'une heure). */
export const getDomain = unstable_cache(fetchDomain, ["catalogue-domaine-v2"], CACHE);

/** Organisations dont la publication a été autorisée, actives et réelles (cache d'une heure). */
export const listPublicPartners = unstable_cache(
  async () => {
    if (!isSupabaseConfigured()) return [];
    const { data } = await createPublicClient()
      .from("organizations")
      .select("id, name, sector, city, description, is_demo")
      .eq("is_public", true).eq("status", "actif").eq("is_demo", false)
      .order("name");
    return data ?? [];
  },
  ["partenaires-publics-v2"],
  { revalidate: 3600, tags: ["catalogue", "partenaires"] },
);

/** Options de sélection (formulaires) : domaines et compétences actifs. */
export async function catalogOptions() {
  const supabase = createPublicClient();
  const [domains, skills] = await Promise.all([
    supabase.from("engineering_domains").select("id, name, slug").eq("is_active", true).order("position"),
    supabase.from("skills").select("id, name, slug, domain_id, category").eq("is_active", true).order("name"),
  ]);
  return { domains: domains.data ?? [], skills: skills.data ?? [] };
}
