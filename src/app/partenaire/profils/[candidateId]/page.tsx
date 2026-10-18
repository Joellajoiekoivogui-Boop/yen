import { notFound } from "next/navigation";
import { PartnerCandidateCard } from "@/components/partner-candidate-card";
import { PageHeader } from "@/components/ui";
import { logAudit } from "@/lib/action";
import { requirePartner } from "@/lib/auth/session";
import { isUuid } from "@/lib/utils";
import { loadPartnerCandidateView } from "@/features/partners/queries";

export default async function SharedProfilePage(props: PageProps<"/partenaire/profils/[candidateId]">) {
  const { candidateId } = await props.params;
  if (!isUuid(candidateId)) notFound();
  const ctx = await requirePartner();
  const view = await loadPartnerCandidateView(candidateId);
  if (!view) notFound(); // partage expiré, révoqué ou consentement retiré
  await logAudit(ctx.userId, "partner_profile_viewed", "candidate_profiles", candidateId, { organization_id: ctx.organizationId });
  return (
    <div className="space-y-5">
      <PageHeader title="Profil partagé" description="Informations professionnelles uniquement. Toute utilisation est limitée au recrutement concerné." />
      <PartnerCandidateCard v={view} />
    </div>
  );
}
