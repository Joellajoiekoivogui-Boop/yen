import "server-only";
import { isSupabaseConfigured } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
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
export async function listDomains(): Promise<DomainSummary[]> {
  if (!isSupabaseConfigured()) {
    return seedDomains.map((d) => ({
      id: d.slug, slug: d.slug, name: d.name, short_description: d.short, icon: d.icon, skillCount: d.skills.length, occupationCount: d.occupations.length,
    }));
  }
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("engineering_domains")
    .select("id, slug, name, short_description, icon, skills(count), occupations(count)")
    .eq("is_active", true)
    .order("position");
  if (error) throw new Error("Impossible de charger les domaines");
  return (data ?? []).map((d) => ({
    id: d.id, slug: d.slug, name: d.name, short_description: d.short_description, icon: d.icon,
    skillCount: (d.skills as unknown as { count: number }[])[0]?.count ?? 0,
    occupationCount: (d.occupations as unknown as { count: number }[])[0]?.count ?? 0,
  }));
}

export async function getDomain(slug: string): Promise<DomainDetail | null> {
  if (!isSupabaseConfigured()) {
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
  const supabase = await createClient();
  const { data: d } = await supabase
    .from("engineering_domains")
    .select("id, slug, name, short_description, description, icon, tools, certifications, project_types, progression_criteria")
    .eq("slug", slug)
    .eq("is_active", true)
    .maybeSingle();
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

/** Options de sélection (formulaires) : domaines et compétences actifs. */
export async function catalogOptions() {
  const supabase = await createClient();
  const [domains, skills] = await Promise.all([
    supabase.from("engineering_domains").select("id, name, slug").eq("is_active", true).order("position"),
    supabase.from("skills").select("id, name, slug, domain_id, category").eq("is_active", true).order("name"),
  ]);
  return { domains: domains.data ?? [], skills: skills.data ?? [] };
}
