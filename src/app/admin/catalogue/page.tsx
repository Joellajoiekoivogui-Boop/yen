import type { Metadata } from "next";
import { Badge, Card, CardBody, CardHeader, PageHeader, TabLinks } from "@/components/ui";
import { requireStaff } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { param } from "@/lib/utils";
import { DomainForm, OccupationForm, SkillForm } from "./forms";

export const metadata: Metadata = { title: "Catalogue des métiers" };

export default async function CataloguePage(props: PageProps<"/admin/catalogue">) {
  const sp = await props.searchParams;
  await requireStaff("catalog.manage");
  const tab = ["domaines", "competences", "metiers"].includes(param(sp.onglet) ?? "") ? param(sp.onglet)! : "domaines";
  const filterDomain = param(sp.domaine);
  const supabase = await createClient();
  const [domains, skills, occupations] = await Promise.all([
    supabase.from("engineering_domains").select("*").order("position"),
    supabase.from("skills").select("*").order("name"),
    supabase.from("occupations").select("*, occupation_skills(skill_id, required_level, importance)").order("title"),
  ]);
  const domainOpts = (domains.data ?? []).map((d) => ({ value: d.id, label: d.name }));
  const skillOpts = (skills.data ?? []).map((s) => ({ value: s.id, label: s.name }));
  const domainName = Object.fromEntries(domainOpts.map((d) => [d.value, d.label]));
  const edit = (title: string, inactive: boolean, form: React.ReactNode, key: string) => (
    <details key={key} className="rounded-lg border border-border bg-white">
      <summary className="flex cursor-pointer items-center justify-between px-4 py-3 text-sm font-medium text-navy-900">{title} {inactive && <Badge>Inactif</Badge>}</summary>
      <div className="border-t border-border p-4">{form}</div>
    </details>
  );
  const filterLinks = (base: string) => (
    <div className="mb-3 flex flex-wrap gap-2 text-xs">
      <a href={base} className={!filterDomain ? "font-semibold text-electric-700" : "text-muted"}>Tous</a>
      {domainOpts.map((d) => <a key={d.value} href={`${base}&domaine=${d.value}`} className={filterDomain === d.value ? "font-semibold text-electric-700" : "text-muted hover:text-navy-900"}>{d.label}</a>)}
    </div>
  );

  return (
    <div className="space-y-5">
      <PageHeader title="Catalogue" description="Domaines, compétences (avec critères observables par niveau) et métiers. Extensible sans modification du code." />
      <TabLinks active={tab} tabs={[{ key: "domaines", label: `Domaines (${domains.data?.length ?? 0})`, href: "/admin/catalogue?onglet=domaines" }, { key: "competences", label: `Compétences (${skills.data?.length ?? 0})`, href: "/admin/catalogue?onglet=competences" }, { key: "metiers", label: `Métiers (${occupations.data?.length ?? 0})`, href: "/admin/catalogue?onglet=metiers" }]} />
      {tab === "domaines" && (
        <div className="space-y-2">
          {(domains.data ?? []).map((d) => edit(d.name, !d.is_active, <DomainForm defaults={{ ...d, tools: d.tools.join("\n"), certifications: d.certifications.join("\n"), project_types: d.project_types.join("\n") }} />, d.id))}
          <Card><CardHeader title="Nouveau domaine" /><CardBody><DomainForm /></CardBody></Card>
        </div>
      )}
      {tab === "competences" && (
        <div className="space-y-2">
          {filterLinks("/admin/catalogue?onglet=competences")}
          {(skills.data ?? []).filter((s) => !filterDomain || s.domain_id === filterDomain).map((s) => edit(`${s.name} — ${s.domain_id ? domainName[s.domain_id] : "Transversale"}`, !s.is_active, <SkillForm domains={domainOpts} defaults={{ ...s, aliases: s.aliases.join(", "), crit_debutant: s.level_criteria?.debutant ?? "", crit_intermediaire: s.level_criteria?.intermediaire ?? "", crit_avance: s.level_criteria?.avance ?? "", crit_expert: s.level_criteria?.expert ?? "", domain_id: s.domain_id ?? "" }} />, s.id))}
          <Card><CardHeader title="Nouvelle compétence" /><CardBody><SkillForm domains={domainOpts} /></CardBody></Card>
        </div>
      )}
      {tab === "metiers" && (
        <div className="space-y-2">
          {filterLinks("/admin/catalogue?onglet=metiers")}
          {(occupations.data ?? []).filter((o) => !filterDomain || o.domain_id === filterDomain).map((o) => {
            const w = o.scoring_weights as Record<string, number> | null;
            return edit(`${o.title} — ${domainName[o.domain_id]}`, !o.is_active, <OccupationForm domains={domainOpts} skills={skillOpts} defaults={{ ...o, skills: o.occupation_skills, w_demonstrated_skills: w?.demonstrated_skills ?? null, w_assessments: w?.assessments ?? null, w_projects: w?.projects ?? null, w_education: w?.education ?? null, w_experience: w?.experience ?? null }} />, o.id);
          })}
          <Card><CardHeader title="Nouveau métier" /><CardBody><OccupationForm domains={domainOpts} skills={skillOpts} /></CardBody></Card>
        </div>
      )}
    </div>
  );
}
