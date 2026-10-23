import type { Metadata } from "next";
import Form from "next/form";
import Link from "next/link";
import { ClipboardCheck, Clock } from "lucide-react";
import { Badge, Button, Card, CardBody, CardHeader, EmptyState, PageHeader, Table, TableEmpty, Td, Th } from "@/components/ui";
import { requireCandidate } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { attemptStatusLabel, levelLabel, type SkillLevel } from "@/lib/labels";
import { formatDateTime, param } from "@/lib/utils";

export const metadata: Metadata = { title: "Mes évaluations" };

export default async function AssessmentsPage(props: PageProps<"/candidat/evaluations">) {
  const sp = await props.searchParams;
  const ctx = await requireCandidate();
  const supabase = await createClient();
  const { data: cand } = await supabase.from("candidate_profiles").select("primary_domain_id").eq("id", ctx.candidateId).single();
  const domainFilter = param(sp.domaine) ?? (param(sp.tous) ? undefined : cand?.primary_domain_id ?? undefined);

  let q = supabase.from("assessments").select("id, title, description, level, duration_minutes, assessment_type, domain_id, engineering_domains(name)").eq("status", "publie").order("level");
  if (domainFilter) q = q.eq("domain_id", domainFilter);
  const [assessments, attempts, domains] = await Promise.all([
    q,
    supabase.from("assessment_attempts").select("id, status, score_percent, passed, started_at, submitted_at, assessments(title)").eq("candidate_id", ctx.candidateId).order("started_at", { ascending: false }),
    supabase.from("engineering_domains").select("id, name").eq("is_active", true).order("position"),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader title="Mes évaluations" description="Questionnaires, études de cas et exercices par domaine. Chaque évaluation affiche son barème. Un questionnaire ne peut jamais attribuer le niveau expert." />

      <Form action="/candidat/evaluations" className="flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor="domaine" className="mb-1 block text-xs font-medium text-muted">Domaine</label>
          <select id="domaine" name="domaine" defaultValue={domainFilter ?? ""} className="field-input min-w-64">
            <option value="">Tous les domaines</option>
            {(domains.data ?? []).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </div>
        <input type="hidden" name="tous" value="1" />
        <Button type="submit" variant="outline">Filtrer</Button>
      </Form>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {(assessments.data ?? []).length === 0 && <div className="md:col-span-3"><EmptyState icon={ClipboardCheck} title="Aucune évaluation publiée pour ce domaine" description="Choisissez un autre domaine dans la liste ci-dessus : l'équipe YEN publie régulièrement de nouvelles évaluations." /></div>}
        {(assessments.data ?? []).map((a) => (
          <Link key={a.id} href={`/candidat/evaluations/${a.id}`} className="block">
            <Card className="h-full p-5 transition hover:border-electric-300 hover:shadow-md">
              <div className="flex flex-wrap gap-1.5">
                <Badge tone="blue">{levelLabel[a.level as SkillLevel]}</Badge>
                <Badge><Clock className="size-3" aria-hidden /> {a.duration_minutes} min</Badge>
              </div>
              <h2 className="mt-3 font-semibold text-navy-900">{a.title}</h2>
              <p className="mt-1 text-xs text-muted">{(a.engineering_domains as unknown as { name: string } | null)?.name}</p>
              <p className="mt-2 line-clamp-3 text-sm text-slate-600">{a.description}</p>
            </Card>
          </Link>
        ))}
      </div>

      <Card>
        <CardHeader title="Historique de mes tentatives" />
        <CardBody>
          <Table>
            <thead><tr><Th>Évaluation</Th><Th>Démarrée</Th><Th>Statut</Th><Th>Résultat</Th><Th /></tr></thead>
            <tbody>
              {(attempts.data ?? []).map((t) => (
                <tr key={t.id}>
                  <Td className="font-medium text-navy-900">{(t.assessments as unknown as { title: string } | null)?.title}</Td>
                  <Td>{formatDateTime(t.started_at)}</Td>
                  <Td><Badge tone={t.status === "corrige" ? "green" : t.status === "en_correction" ? "amber" : "neutral"}>{attemptStatusLabel[t.status as keyof typeof attemptStatusLabel]}</Badge></Td>
                  <Td className="tabular-nums">{t.score_percent != null ? `${Math.round(Number(t.score_percent))} %${t.passed ? " ✓" : ""}` : "—"}</Td>
                  <Td className="text-right"><Link href={`/candidat/evaluations/tentative/${t.id}`} className="text-sm text-electric-700 hover:underline">{t.status === "en_cours" ? "Reprendre" : "Détail"}</Link></Td>
                </tr>
              ))}
              {(attempts.data ?? []).length === 0 && <TableEmpty colSpan={5}>Aucune tentative.</TableEmpty>}
            </tbody>
          </Table>
        </CardBody>
      </Card>
    </div>
  );
}
