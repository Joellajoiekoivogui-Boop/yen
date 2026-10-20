import Link from "next/link";
import { Badge, Card, PageHeader, Table, Td, Th } from "@/components/ui";
import { requirePartner } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { applicationStatusLabel, type ApplicationStatus } from "@/lib/labels";
import { formatDate } from "@/lib/utils";
import { publicCodesForVisibleApplications } from "@/features/partners/queries";

export default async function PartnerApplicationsPage() {
  const ctx = await requirePartner();
  const supabase = await createClient();
  const { data } = await supabase
    .from("applications")
    .select("id, status, origin, submitted_at, partner_shortlisted, candidate_id, job_offers!inner(title, organization_id)")
    .eq("job_offers.organization_id", ctx.organizationId)
    .order("updated_at", { ascending: false });
  const codes = await publicCodesForVisibleApplications((data ?? []).map((a) => a.candidate_id));
  return (
    <div className="space-y-5">
      <PageHeader title="Candidatures reçues" description="Candidatures envoyées par les candidats et profils proposés par YEN pour vos offres." />
      <Card>
        <Table>
          <thead><tr><Th>Candidat</Th><Th>Offre</Th><Th>Origine</Th><Th>Date</Th><Th>Statut</Th></tr></thead>
          <tbody>
            {(data ?? []).map((a) => (
              <tr key={a.id}>
                <Td><Link className="font-mono text-xs text-electric-700 hover:underline" href={`/partenaire/candidatures/${a.id}`}>{codes.get(a.candidate_id) ?? "Voir"}</Link> {a.partner_shortlisted && <Badge tone="gold">Présélectionné</Badge>}</Td>
                <Td>{(a.job_offers as unknown as { title: string }).title}</Td>
                <Td>{a.origin === "yen" ? "Proposé par YEN" : "Candidature"}</Td>
                <Td>{formatDate(a.submitted_at)}</Td>
                <Td><Badge tone="blue">{applicationStatusLabel[a.status as ApplicationStatus]}</Badge></Td>
              </tr>
            ))}
            {(data ?? []).length === 0 && <tr><Td colSpan={5} className="text-center text-muted">Aucune candidature.</Td></tr>}
          </tbody>
        </Table>
      </Card>
    </div>
  );
}
