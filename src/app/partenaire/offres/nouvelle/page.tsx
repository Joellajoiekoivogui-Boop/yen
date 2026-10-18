import { OfferForm } from "@/components/forms/offer-form";
import { Card, CardBody, PageHeader } from "@/components/ui";
import { requirePartner } from "@/lib/auth/session";
import { partnerSaveOfferAction } from "@/features/offers/actions";
import { partnerOfferOptions } from "../options";

export default async function PartnerNewOfferPage() {
  const ctx = await requirePartner();
  const opts = await partnerOfferOptions();
  return (
    <div className="space-y-5">
      <PageHeader title="Nouvelle offre" description="Enregistrée en brouillon ; soumettez-la ensuite à la validation de YEN." />
      <Card><CardBody><OfferForm {...opts} lockOrganization defaults={{ organization_id: ctx.organizationId }} action={partnerSaveOfferAction} showWeights={false} redirectBase="/partenaire/offres" /></CardBody></Card>
    </div>
  );
}
