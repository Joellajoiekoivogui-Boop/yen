import { notFound } from "next/navigation";
import Link from "next/link";
import { ActionButton } from "@/components/forms/action-button";
import { OfferForm } from "@/components/forms/offer-form";
import { Alert, Badge, Card, CardBody, CardHeader, PageHeader, Table, TableEmpty, Td, Th } from "@/components/ui";
import { requirePartner } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { applicationStatusLabel, offerStatusLabel, type ApplicationStatus, type OfferStatus, type SkillLevel } from "@/lib/labels";
import { formatDate, isUuid } from "@/lib/utils";
import { partnerSaveOfferAction, setOfferStatusAction } from "@/features/offers/actions";
import { partnerOfferOptions } from "../options";
import { publicCodesForVisibleApplications } from "@/features/partners/queries";

export default async function PartnerOfferPage(props: PageProps<"/partenaire/offres/[id]">) {
  const { id } = await props.params;
  if (!isUuid(id)) notFound();
  const ctx = await requirePartner();
  const supabase = await createClient();
  const { data: o } = await supabase.from("job_offers").select("*, job_required_skills(skill_id, required_level, is_mandatory)").eq("id", id).eq("organization_id", ctx.organizationId).maybeSingle();
  if (!o) notFound();
  const editable = ["brouillon", "en_validation"].includes(o.status);
  const { data: apps } = await supabase.from("applications").select("id, status, submitted_at, partner_shortlisted, candidate_id").eq("offer_id", id).order("submitted_at", { ascending: false });
  const codes = await publicCodesForVisibleApplications((apps ?? []).map((a) => a.candidate_id));
  const opts = await partnerOfferOptions();
  return (
    <div className="space-y-6">
      <PageHeader
        title={o.title}
        actions={
          <div className="flex items-center gap-2">
            <Badge tone={o.status === "publiee" ? "green" : "amber"}>{offerStatusLabel[o.status as OfferStatus]}</Badge>
            {o.status === "brouillon" && <ActionButton variant="secondary" action={setOfferStatusAction.bind(null, id, "en_validation")}>Soumettre à YEN</ActionButton>}
            {o.status === "publiee" && <ActionButton confirm="Fermer cette offre aux candidatures ?" action={setOfferStatusAction.bind(null, id, "fermee")}>Fermer</ActionButton>}
          </div>
        }
      />
      <Card>
        <CardHeader title="Candidatures visibles" />
        <CardBody>
          <Table>
            <thead><tr><Th>Candidat</Th><Th>Date</Th><Th>Statut</Th><Th /></tr></thead>
            <tbody>
              {(apps ?? []).map((a) => (
                <tr key={a.id}>
                  <Td className="font-mono text-xs">{codes.get(a.candidate_id)} {a.partner_shortlisted && <Badge tone="gold">Présélectionné</Badge>}</Td>
                  <Td>{formatDate(a.submitted_at)}</Td>
                  <Td><Badge tone="blue">{applicationStatusLabel[a.status as ApplicationStatus]}</Badge></Td>
                  <Td className="text-right"><Link href={`/partenaire/candidatures/${a.id}`} className="text-sm text-electric-700 hover:underline">Ouvrir</Link></Td>
                </tr>
              ))}
              {(apps ?? []).length === 0 && <TableEmpty colSpan={4}>Aucune candidature visible.</TableEmpty>}
            </tbody>
          </Table>
        </CardBody>
      </Card>
      {editable ? (
        <Card>
          <CardHeader title="Modifier l'offre" />
          <CardBody>
            <OfferForm {...opts} lockOrganization action={partnerSaveOfferAction} showWeights={false} redirectBase="/partenaire/offres"
              defaults={{ id: o.id, organization_id: o.organization_id, title: o.title, description: o.description, offer_type: o.offer_type, domain_id: o.domain_id, occupation_id: o.occupation_id, education_level: o.education_level, min_experience_months: o.min_experience_months, location: o.location, remote_policy: o.remote_policy, deadline: o.deadline, positions: o.positions, special_conditions: o.special_conditions, skills: (o.job_required_skills ?? []) as { skill_id: string; required_level: SkillLevel; is_mandatory: boolean }[] }} />
          </CardBody>
        </Card>
      ) : <Alert tone="info">Cette offre n&apos;est plus modifiable par le partenaire. Contactez YEN pour toute correction.</Alert>}
    </div>
  );
}
