import { Card, CardBody, PageHeader } from "@/components/ui";
import { requirePartner } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { PartnerOrgForm } from "./form";

export default async function PartnerOrganizationPage() {
  const ctx = await requirePartner();
  const supabase = await createClient();
  const [{ data: o }, domains] = await Promise.all([
    supabase.from("organizations").select("*, organization_domains(domain_id)").eq("id", ctx.organizationId).single(),
    supabase.from("engineering_domains").select("id, name").eq("is_active", true).order("position"),
  ]);
  if (!o) return null;
  return (
    <div className="space-y-5">
      <PageHeader title="Mon organisation" description="Le statut du partenariat et la publication sur le site public sont gérés par YEN." />
      <Card><CardBody>
        <PartnerOrgForm domains={(domains.data ?? []).map((d) => ({ value: d.id, label: d.name }))} defaults={{ ...o, domain_ids: (o.organization_domains as { domain_id: string }[]).map((d) => d.domain_id) }} />
      </CardBody></Card>
    </div>
  );
}
