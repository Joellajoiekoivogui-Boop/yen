import Link from "next/link";
import { Plus } from "lucide-react";
import { Badge, ButtonLink, Card, PageHeader, Table, TableEmpty, Td, Th } from "@/components/ui";
import { requirePartner } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { offerStatusLabel, opportunityLabel, type OfferStatus, type OpportunityType } from "@/lib/labels";
import { formatDate } from "@/lib/utils";

export default async function PartnerOffersPage() {
  const ctx = await requirePartner();
  const supabase = await createClient();
  const { data } = await supabase.from("job_offers").select("id, title, offer_type, status, deadline, created_at").eq("organization_id", ctx.organizationId).order("created_at", { ascending: false });
  return (
    <div className="space-y-5">
      <PageHeader title="Mes offres" description="Vos offres sont publiées après validation par l'équipe YEN." actions={<ButtonLink href="/partenaire/offres/nouvelle" variant="secondary"><Plus className="size-4" aria-hidden /> Nouvelle offre</ButtonLink>} />
      <Card>
        <Table>
          <thead><tr><Th>Offre</Th><Th>Type</Th><Th>Date limite</Th><Th>Statut</Th></tr></thead>
          <tbody>
            {(data ?? []).map((o) => (
              <tr key={o.id}>
                <Td><Link className="font-medium text-navy-900 hover:underline" href={`/partenaire/offres/${o.id}`}>{o.title}</Link></Td>
                <Td>{opportunityLabel[o.offer_type as OpportunityType]}</Td>
                <Td>{formatDate(o.deadline)}</Td>
                <Td><Badge tone={o.status === "publiee" ? "green" : o.status === "en_validation" ? "amber" : "neutral"}>{offerStatusLabel[o.status as OfferStatus]}</Badge></Td>
              </tr>
            ))}
            {(data ?? []).length === 0 && <TableEmpty colSpan={4}>Aucune offre.</TableEmpty>}
          </tbody>
        </Table>
      </Card>
    </div>
  );
}
