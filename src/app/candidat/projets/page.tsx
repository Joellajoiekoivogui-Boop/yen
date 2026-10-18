import type { Metadata } from "next";
import { FolderKanban } from "lucide-react";
import { Card, CardBody, CardHeader, PageHeader } from "@/components/ui";
import { requireCandidate } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { loadCandidateBundle } from "@/features/candidates/queries";
import { catalogOptions } from "@/features/catalog/queries";
import { ProjectsList } from "./projects-client";

export const metadata: Metadata = { title: "Mes projets" };

const vBadge = { verifie: { label: "Vérifié par YEN", tone: "green" as const }, rejete: { label: "Non validé", tone: "red" as const }, non_verifie: { label: "En attente de vérification", tone: "amber" as const } };

export default async function ProjectsPage() {
  const ctx = await requireCandidate();
  const supabase = await createClient();
  const [b, { domains, skills }] = await Promise.all([loadCandidateBundle(supabase, ctx.candidateId), catalogOptions()]);
  if (!b) return null;
  // Compétences proposées : domaine principal + transversales + déjà déclarées
  const declared = new Set(b.declaredSkills.map((d) => d.skill_id));
  const relevant = skills.filter((s) => !s.domain_id || s.domain_id === b.candidate.primary_domain_id || declared.has(s.id));
  return (
    <div className="space-y-6">
      <PageHeader title="Mes projets" description="Projets académiques, personnels ou professionnels. Modifier un projet vérifié annule sa vérification." />
      <Card>
        <CardHeader icon={FolderKanban} title="Projets et réalisations" />
        <CardBody>
          <ProjectsList
            domains={domains}
            skills={relevant}
            items={b.projects.map((p) => ({
              id: p.id,
              title: p.title,
              subtitle: [p.role, p.technologies.join(", ")].filter(Boolean).join(" · "),
              description: [p.description, p.outcomes && `Résultats : ${p.outcomes}`, p.verification_note && `Note YEN : ${p.verification_note}`].filter(Boolean).join("\n"),
              badges: [vBadge[p.verification_status as keyof typeof vBadge], ...p.project_skills.map((s) => ({ label: s.skills?.name ?? "", tone: "blue" as const }))],
              values: {
                title: p.title, role: p.role ?? "", description: p.description, outcomes: p.outcomes ?? "", technologies: p.technologies.join(", "),
                domain_id: p.domain_id ?? "", start_date: p.start_date ?? "", end_date: p.end_date ?? "", project_url: p.project_url ?? "", repository_url: p.repository_url ?? "",
                skill_ids: p.project_skills.map((s) => s.skill_id),
              },
            }))}
          />
        </CardBody>
      </Card>
    </div>
  );
}
