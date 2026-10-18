import type { Metadata } from "next";
import Link from "next/link";
import { ActionButton } from "@/components/forms/action-button";
import { Badge, Card, CardBody, CardHeader, EmptyState, PageHeader, Table, Td, Th } from "@/components/ui";
import { requireStaff } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { levelLabel, skillSourceLabel } from "@/lib/labels";
import { formatDateTime } from "@/lib/utils";
import { setEvidenceStatusAction } from "@/features/assessments/actions";

export const metadata: Metadata = { title: "Corrections et validations" };

export default async function CorrectionsPage() {
  await requireStaff("assessments.review");
  const supabase = await createClient();
  const [attempts, pending, feedback] = await Promise.all([
    supabase.from("assessment_attempts").select("id, submitted_at, assessments(title), candidate_profiles(id, public_code)").eq("status", "en_correction").order("submitted_at"),
    supabase.from("skill_assessments").select("id, level, source, notes, assessed_at, skills(name), candidate_profiles(id, public_code)").eq("status", "en_attente").order("assessed_at"),
    supabase.from("partner_feedback").select("id, context, overall_rating, comments, created_at, applications(candidate_id, job_offers(title, organizations(name)))").order("created_at", { ascending: false }).limit(20),
  ]);
  return (
    <div className="space-y-6">
      <PageHeader title="Corrections et validations" description="Réponses libres à corriger, preuves en attente (retours partenaires) et retours reçus." />
      <Card>
        <CardHeader title="Tentatives en attente de correction humaine" />
        <CardBody>
          {(attempts.data ?? []).length === 0 ? <EmptyState title="Aucune correction en attente" /> : (
            <Table>
              <thead><tr><Th>Évaluation</Th><Th>Candidat</Th><Th>Soumise le</Th><Th /></tr></thead>
              <tbody>
                {(attempts.data ?? []).map((t) => (
                  <tr key={t.id}>
                    <Td className="font-medium text-navy-900">{(t.assessments as unknown as { title: string }).title}</Td>
                    <Td className="font-mono text-xs">{(t.candidate_profiles as unknown as { public_code: string }).public_code}</Td>
                    <Td>{formatDateTime(t.submitted_at)}</Td>
                    <Td className="text-right"><Link href={`/admin/corrections/${t.id}`} className="text-sm font-medium text-electric-700 hover:underline">Corriger</Link></Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </CardBody>
      </Card>
      <Card>
        <CardHeader title="Preuves en attente de validation" description="Les niveaux indiqués par les partenaires ne comptent qu'après validation." />
        <CardBody>
          {(pending.data ?? []).length === 0 ? <EmptyState title="Aucune preuve en attente" /> : (
            <Table>
              <thead><tr><Th>Candidat</Th><Th>Compétence</Th><Th>Niveau</Th><Th>Source</Th><Th>Détail</Th><Th /></tr></thead>
              <tbody>
                {(pending.data ?? []).map((s) => {
                  const c = s.candidate_profiles as unknown as { id: string; public_code: string };
                  return (
                    <tr key={s.id}>
                      <Td><Link href={`/admin/talents/${c.id}?onglet=demontrees`} className="font-mono text-xs text-electric-700 hover:underline">{c.public_code}</Link></Td>
                      <Td>{(s.skills as unknown as { name: string }).name}</Td>
                      <Td>{levelLabel[s.level as keyof typeof levelLabel]}</Td>
                      <Td>{skillSourceLabel[s.source as keyof typeof skillSourceLabel]}</Td>
                      <Td className="max-w-xs text-xs">{s.notes}</Td>
                      <Td><div className="flex gap-1"><ActionButton action={setEvidenceStatusAction.bind(null, { id: s.id, status: "valide" })}>Valider</ActionButton><ActionButton variant="ghost" action={setEvidenceStatusAction.bind(null, { id: s.id, status: "invalide" })}>Rejeter</ActionButton></div></Td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          )}
        </CardBody>
      </Card>
      <Card>
        <CardHeader title="Derniers retours des partenaires" />
        <CardBody className="space-y-2">
          {(feedback.data ?? []).length === 0 && <p className="text-sm text-muted">Aucun retour.</p>}
          {(feedback.data ?? []).map((f) => {
            const a = f.applications as unknown as { candidate_id: string; job_offers: { title: string; organizations: { name: string } | null } };
            return (
              <div key={f.id} className="rounded-lg border border-border p-3 text-sm">
                <p className="text-xs text-muted">{formatDateTime(f.created_at)} · {a.job_offers.organizations?.name} · {a.job_offers.title} · <Badge>{f.context}</Badge> {f.overall_rating && `· ${f.overall_rating}/5`}</p>
                <p className="mt-1 text-slate-700">{f.comments}</p>
                <Link href={`/admin/talents/${a.candidate_id}`} className="text-xs text-electric-700 hover:underline">Voir le candidat</Link>
              </div>
            );
          })}
        </CardBody>
      </Card>
    </div>
  );
}
