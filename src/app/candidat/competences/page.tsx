import type { Metadata } from "next";
import Link from "next/link";
import { CheckCircle2, ListChecks, Target } from "lucide-react";
import { Badge, Card, CardBody, CardHeader, EmptyState, PageHeader, Table, Td, Th } from "@/components/ui";
import { requireCandidate } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { confidenceLabel, levelLabel, skillSourceLabel } from "@/lib/labels";
import { formatDate } from "@/lib/utils";
import { loadCandidateBundle } from "@/features/candidates/queries";
import { aggregateDemonstrated } from "@/features/candidates/skills";
import { DeclaredSkills } from "./skills-client";

export const metadata: Metadata = { title: "Mes compétences" };

const statusTone = { valide: "green", en_attente: "amber", conteste: "red", invalide: "neutral" } as const;
const statusText = { valide: "Validée", en_attente: "En attente de validation YEN", conteste: "Contestée", invalide: "Invalidée" } as const;

export default async function SkillsPage() {
  const ctx = await requireCandidate();
  const supabase = await createClient();
  const [b, skills, domains, assessmentSkills] = await Promise.all([
    loadCandidateBundle(supabase, ctx.candidateId),
    supabase.from("skills").select("id, name, domain_id, category").eq("is_active", true).order("name"),
    supabase.from("engineering_domains").select("id, name"),
    supabase.from("assessment_skills").select("skill_id, assessments!inner(id, title, status)").eq("assessments.status", "publie"),
  ]);
  if (!b) return null;
  const domainName = Object.fromEntries((domains.data ?? []).map((d) => [d.id, d.name]));
  const demonstrated = aggregateDemonstrated(b.skillAssessments);
  const skillName = Object.fromEntries((skills.data ?? []).map((s) => [s.id, s.name]));
  const toEvaluate = b.declaredSkills.filter((d) => !demonstrated[d.skill_id]);
  const assessmentsFor = (skillId: string) => (assessmentSkills.data ?? []).filter((x) => x.skill_id === skillId).map((x) => x.assessments as unknown as { id: string; title: string });

  return (
    <div className="space-y-6">
      <PageHeader title="Mes compétences" description="Les compétences déclarées et celles démontrées sont toujours distinguées. Une compétence mentionnée dans un CV n'est jamais considérée comme démontrée." />

      <Card>
        <CardHeader icon={CheckCircle2} title="Compétences démontrées" description="Preuves : évaluations, projets vérifiés, évaluateurs YEN" />
        <CardBody>
          {Object.keys(demonstrated).length === 0 ? (
            <EmptyState icon={CheckCircle2} title="Aucune compétence démontrée pour l'instant" description="Passez une évaluation de votre domaine pour faire reconnaître vos compétences." />
          ) : (
            <Table>
              <thead><tr><Th>Compétence</Th><Th>Niveau démontré</Th><Th>Meilleur score</Th><Th>Preuves</Th></tr></thead>
              <tbody>
                {Object.entries(demonstrated).map(([skillId, d]) => (
                  <tr key={skillId}>
                    <Td className="font-medium text-navy-900">{skillName[skillId] ?? "—"}</Td>
                    <Td><Badge tone="gold">{levelLabel[d.level]}</Badge></Td>
                    <Td className="tabular-nums">{d.bestScorePercent != null ? `${Math.round(d.bestScorePercent)} %` : "—"}</Td>
                    <Td className="text-xs">{d.sources.map((s) => s.label).join(" · ")}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </CardBody>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader icon={ListChecks} title="Compétences déclarées" />
          <CardBody>
            <DeclaredSkills
              skills={(skills.data ?? []).map((s) => ({ id: s.id, name: s.name, group: s.domain_id ? domainName[s.domain_id] ?? "" : "Transversale" }))}
              items={b.declaredSkills.map((d) => ({
                id: d.id,
                title: d.skills?.name ?? "—",
                subtitle: `Auto-évaluation : ${levelLabel[d.self_level]}${d.years_experience ? ` · ${d.years_experience} an(s)` : ""}`,
                description: d.evidence_note ?? undefined,
                badges: [
                  demonstrated[d.skill_id] ? { label: `Démontrée (${levelLabel[demonstrated[d.skill_id].level]})`, tone: "gold" as const } : { label: "À démontrer", tone: "amber" as const },
                  ...(d.source === "extraction_cv_validee" ? [{ label: "Issue du CV", tone: "purple" as const }] : []),
                ],
                values: { skill_id: d.skill_id, self_level: d.self_level, years_experience: d.years_experience, evidence_note: d.evidence_note ?? "" },
              }))}
            />
          </CardBody>
        </Card>

        <Card>
          <CardHeader icon={Target} title="Compétences restant à évaluer" />
          <CardBody>
            {toEvaluate.length === 0 ? (
              <p className="text-sm text-muted">Toutes vos compétences déclarées ont été démontrées, ou vous n&apos;en avez pas encore déclaré.</p>
            ) : (
              <ul className="space-y-3">
                {toEvaluate.map((d) => {
                  const list = assessmentsFor(d.skill_id);
                  return (
                    <li key={d.id} className="rounded-lg border border-border p-3">
                      <p className="font-medium text-navy-900">{d.skills?.name}</p>
                      {list.length ? (
                        <p className="mt-1 text-sm">Évaluation disponible : {list.map((a, i) => <span key={a.id}>{i > 0 && ", "}<Link className="text-electric-700 hover:underline" href={`/candidat/evaluations/${a.id}`}>{a.title}</Link></span>)}</p>
                      ) : (
                        <p className="mt-1 text-sm text-muted">Pas encore d&apos;évaluation en ligne : documentez un projet ou demandez une évaluation par un formateur YEN.</p>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader title="Historique des preuves" />
        <CardBody>
          <Table>
            <thead><tr><Th>Date</Th><Th>Compétence</Th><Th>Niveau</Th><Th>Source</Th><Th>Confiance</Th><Th>Statut</Th></tr></thead>
            <tbody>
              {b.skillAssessments.map((s) => (
                <tr key={s.id}>
                  <Td>{formatDate(s.assessed_at)}</Td>
                  <Td>{s.skills?.name}</Td>
                  <Td>{levelLabel[s.level]}{s.score_percent != null && <span className="text-xs text-muted"> ({Math.round(Number(s.score_percent))} %)</span>}</Td>
                  <Td>{skillSourceLabel[s.source]}</Td>
                  <Td>{confidenceLabel[s.confidence as keyof typeof confidenceLabel]}</Td>
                  <Td><Badge tone={statusTone[s.status]}>{statusText[s.status]}</Badge></Td>
                </tr>
              ))}
              {b.skillAssessments.length === 0 && <tr><Td colSpan={6} className="text-center text-muted">Aucune preuve enregistrée.</Td></tr>}
            </tbody>
          </Table>
        </CardBody>
      </Card>
    </div>
  );
}
