import type { Metadata } from "next";
import { OfferForm } from "@/components/forms/offer-form";
import { Card, CardBody, PageHeader } from "@/components/ui";
import { requireStaff } from "@/lib/auth/session";
import { saveOfferAction } from "@/features/offers/actions";
import { offerFormOptions } from "../options";

export const metadata: Metadata = { title: "Nouvelle offre" };

export default async function NewOfferPage() {
  await requireStaff("offers.manage");
  const opts = await offerFormOptions();
  return (
    <div className="space-y-5">
      <PageHeader title="Nouvelle offre" description="L'offre est créée en brouillon ; publiez-la depuis sa fiche." />
      <Card><CardBody><OfferForm {...opts} defaults={{}} action={saveOfferAction} showWeights redirectBase="/admin/offres" /></CardBody></Card>
    </div>
  );
}
