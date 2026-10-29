import type { Metadata } from "next";
import Link from "next/link";
import { Badge, Card, CardBody, CardHeader, PageHeader, Table, Td, Th } from "@/components/ui";
import { requireStaff } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { levelLabel, type SkillLevel } from "@/lib/labels";
import { AssessmentForm } from "./forms";

export const metadata: Metadata = { title: "Entretiens" };

export default async function AdminAssessmentsPage() {
  await requireStaff("assessments.manage");
  const supabase = await createClient();
  const [list, domains, skills] = await Promise.all([
    supabase.from("assessments").select("id, title, level, status, version, duration_minutes, engineering_domains(name), assessment_questions(count), assessment_attempts(count)").order("created_at", { ascending: false }),
    supabase.from("engineering_domains").select("id, name").eq("is_active", true).order("position"),
    supabase.from("skills").select("id, name").eq("is_active", true).order("name"),
  ]);
  return (
    <div className="space-y-6">
      <PageHeader title="Entretiens et banque de questions" description="Toute modification d'un entretien publié incrémente sa version ; les tentatives conservent la version passée." />
      <Card>
        <Table>
          <thead><tr><Th>Entretien</Th><Th>Domaine</Th><Th>Niveau</Th><Th>Questions</Th><Th>Tentatives</Th><Th>Version</Th><Th>Statut</Th></tr></thead>
          <tbody>
            {(list.data ?? []).map((a) => (
              <tr key={a.id}>
                <Td><Link href={`/admin/evaluations/${a.id}`} className="font-medium text-navy-900 hover:underline">{a.title}</Link></Td>
                <Td>{(a.engineering_domains as unknown as { name: string } | null)?.name}</Td>
                <Td>{levelLabel[a.level as SkillLevel]}</Td>
                <Td className="tabular-nums">{(a.assessment_questions as unknown as { count: number }[])[0]?.count ?? 0}</Td>
                <Td className="tabular-nums">{(a.assessment_attempts as unknown as { count: number }[])[0]?.count ?? 0}</Td>
                <Td>v{a.version}</Td>
                <Td><Badge tone={a.status === "publie" ? "green" : a.status === "brouillon" ? "amber" : "neutral"}>{a.status}</Badge></Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
      <Card>
        <CardHeader title="Nouvel entretien" />
        <CardBody><AssessmentForm domains={(domains.data ?? []).map((d) => ({ value: d.id, label: d.name }))} skills={(skills.data ?? []).map((d) => ({ value: d.id, label: d.name }))} /></CardBody>
      </Card>
    </div>
  );
}
