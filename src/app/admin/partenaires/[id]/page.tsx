import { notFound } from "next/navigation";
import Link from "next/link";
import { ActionButton } from "@/components/forms/action-button";
import { Badge, Card, CardBody, CardHeader, PageHeader, Table, Td } from "@/components/ui";
import { requireStaff } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { formatDate, fullName, isUuid } from "@/lib/utils";
import { offerStatusLabel, type OfferStatus } from "@/lib/labels";
import { setMembershipStatusAction } from "@/features/admin/actions";
import { OrganizationEventForm, OrganizationForm, OrganizationStatusForm } from "../forms";

export default async function PartnerAdminPage(props: PageProps<"/admin/partenaires/[id]">) {
  const { id } = await props.params;
  if (!isUuid(id)) notFound();
  await requireStaff("partners.manage");
  const supabase = await createClient();
  const [{ data: o }, members, offers, events, placements, domains] = await Promise.all([
    supabase.from("organizations").select("*, organization_domains(domain_id)").eq("id", id).maybeSingle(),
    supabase.from("partner_memberships").select("id, status, role_in_org, created_at, approved_at, profiles!partner_memberships_user_id_fkey(first_name, last_name, email)").eq("organization_id", id),
    supabase.from("job_offers").select("id, title, status, created_at").eq("organization_id", id).order("created_at", { ascending: false }),
    supabase.from("organization_events").select("id, event_type, description, occurred_on").eq("organization_id", id).order("occurred_on", { ascending: false }),
    supabase.from("placements").select("id, position_title, placement_type, start_date, confirmation_status").eq("organization_id", id).order("start_date", { ascending: false }),
    supabase.from("engineering_domains").select("id, name").eq("is_active", true).order("position"),
  ]);
  if (!o) notFound();
  return (
    <div className="space-y-6">
      <PageHeader title={o.name} description={[o.sector, o.city, o.country].filter(Boolean).join(" · ")} actions={<Badge tone={o.status === "actif" ? "green" : "amber"}>{o.status}</Badge>} />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card><CardHeader title="Informations" /><CardBody><OrganizationForm domains={(domains.data ?? []).map((d) => ({ value: d.id, label: d.name }))} defaults={{ ...o, domain_ids: (o.organization_domains as { domain_id: string }[]).map((d) => d.domain_id) }} /></CardBody></Card>
          <Card>
            <CardHeader title="Historique des collaborations" />
            <CardBody className="space-y-4">
              <OrganizationEventForm organizationId={id} />
              <ul className="space-y-2 text-sm">
                {(offers.data ?? []).map((of) => <li key={of.id}>{formatDate(of.created_at)} — Offre <Link className="text-electric-700 hover:underline" href={`/admin/offres/${of.id}`}>{of.title}</Link> ({offerStatusLabel[of.status as OfferStatus]})</li>)}
                {(placements.data ?? []).map((p) => <li key={p.id}>{formatDate(p.start_date)} — Placement : {p.position_title} ({p.placement_type}, {p.confirmation_status})</li>)}
                {(events.data ?? []).map((e) => <li key={e.id}>{formatDate(e.occurred_on)} — <Badge>{e.event_type}</Badge> {e.description}</li>)}
              </ul>
            </CardBody>
          </Card>
        </div>
        <div className="space-y-6">
          <Card><CardHeader title="Statut et accès" /><CardBody><OrganizationStatusForm organizationId={id} defaults={{ status: o.status, portal_enabled: o.portal_enabled, is_public: o.is_public }} /></CardBody></Card>
          <Card>
            <CardHeader title="Recruteurs" description="Un recruteur n'accède qu'aux candidatures de ses offres et aux profils partagés avec consentement." />
            <CardBody>
              <Table className="min-w-0">
                <tbody>
                  {(members.data ?? []).map((m) => {
                    const p = m.profiles as unknown as { first_name: string; last_name: string; email: string };
                    return (
                      <tr key={m.id}>
                        <Td><p className="font-medium text-navy-900">{fullName(p)}</p><p className="text-xs text-muted">{p.email}</p><Badge tone={m.status === "actif" ? "green" : m.status === "en_attente" ? "amber" : "neutral"}>{m.status}</Badge></Td>
                        <Td className="text-right">
                          {m.status !== "actif" && <ActionButton variant="secondary" action={setMembershipStatusAction.bind(null, { membershipId: m.id, status: "actif" })}>Valider</ActionButton>}
                          {m.status !== "revoque" && <ActionButton variant="ghost" confirm="Révoquer l'accès de ce recruteur ?" action={setMembershipStatusAction.bind(null, { membershipId: m.id, status: "revoque" })}>Révoquer</ActionButton>}
                        </Td>
                      </tr>
                    );
                  })}
                  {(members.data ?? []).length === 0 && <tr><Td className="text-muted">Aucun recruteur.</Td></tr>}
                </tbody>
              </Table>
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  );
}
