import type { Metadata } from "next";
import Link from "next/link";
import { Badge, Card, CardBody, CardHeader, PageHeader, Table, Td, Th } from "@/components/ui";
import { requireStaff } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { organizationStatusLabel } from "@/lib/labels";
import { formatDate, fullName } from "@/lib/utils";
import { OrganizationForm } from "./forms";
import { PartnerRequestActions } from "./request-actions";

export const metadata: Metadata = { title: "Partenaires" };

const tone = { actif: "green", en_attente: "amber", suspendu: "red", inactif: "neutral" } as const;

type Member = { status: string; created_at: string; profiles: { first_name: string; last_name: string; email: string; phone: string | null } | null };

export default async function PartnersAdminPage() {
  await requireStaff("partners.manage");
  const supabase = await createClient();
  const [orgs, domains] = await Promise.all([
    supabase
      .from("organizations")
      .select("id, name, sector, city, status, portal_enabled, is_public, is_demo, created_at, contact_name, contact_email, contact_phone, job_offers(count), partner_memberships(status, created_at, profiles!partner_memberships_user_id_fkey(first_name, last_name, email, phone))")
      .order("created_at", { ascending: false }),
    supabase.from("engineering_domains").select("id, name").eq("is_active", true).order("position"),
  ]);
  const rows = (orgs.data ?? []).map((o) => ({ ...o, members: o.partner_memberships as unknown as Member[] }));
  // à traiter : organisation nouvelle (en attente), ou organisation active avec un nouveau recruteur
  const requests = rows.filter((o) => o.status === "en_attente" || (o.status === "actif" && o.members.some((m) => m.status === "en_attente")));
  return (
    <div className="space-y-6">
      <PageHeader title="Partenaires" description="Entreprises, ONG, bureaux d'études et institutions." />
      {requests.length > 0 && (
        <Card className="border-amber-300">
          <CardHeader
            title={`Demandes en attente (${requests.length})`}
            description="Accepter ouvre l'espace partenaire de l'organisation et prévient le recruteur. Refuser l'informe que sa demande n'est pas retenue."
          />
          <ul className="divide-y divide-border">
            {requests.map((o) => {
              const requester = o.members.find((m) => m.status === "en_attente");
              const p = requester?.profiles;
              const contact = p ? [fullName(p), p.email, p.phone] : [o.contact_name, o.contact_email, o.contact_phone];
              return (
                <li key={o.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2">
                      <Link href={`/admin/partenaires/${o.id}`} className="font-semibold text-navy-900 hover:underline">{o.name}</Link>
                      <Badge tone="amber">{o.status === "en_attente" ? "Nouvelle organisation" : "Nouveau recruteur"}</Badge>
                    </p>
                    <p className="mt-1 text-sm break-words text-muted">
                      {[...contact.filter(Boolean), `demande du ${formatDate(requester?.created_at ?? o.created_at)}`].join(" · ")}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-start gap-2">
                    <PartnerRequestActions organizationId={o.id} name={o.name} />
                    <Link href={`/admin/partenaires/${o.id}`} className="inline-flex h-8 items-center px-2 text-sm font-medium text-electric-700 hover:underline">Voir la fiche</Link>
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>
      )}
      <Card>
        <Table>
          <thead><tr><Th>Organisation</Th><Th>Secteur</Th><Th>Ville</Th><Th>Offres</Th><Th>Recruteurs</Th><Th>Espace</Th><Th>Statut</Th><Th>Depuis</Th></tr></thead>
          <tbody>
            {rows.map((o) => (
              <tr key={o.id}>
                <Td><Link href={`/admin/partenaires/${o.id}`} className="font-medium text-navy-900 hover:underline">{o.name}</Link> {o.is_demo && <Badge tone="purple">Démo</Badge>} {o.is_public && <Badge tone="gold">Public</Badge>}</Td>
                <Td>{o.sector}</Td><Td>{o.city}</Td>
                <Td className="tabular-nums">{(o.job_offers as unknown as { count: number }[])[0]?.count ?? 0}</Td>
                <Td className="tabular-nums">{o.members.length}</Td>
                <Td>{o.portal_enabled ? "Activé" : "—"}</Td>
                <Td><Badge tone={tone[o.status as keyof typeof tone]}>{organizationStatusLabel[o.status] ?? o.status}</Badge></Td>
                <Td>{formatDate(o.created_at)}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
      <Card><CardHeader title="Ajouter une organisation" /><CardBody><OrganizationForm domains={(domains.data ?? []).map((d) => ({ value: d.id, label: d.name }))} /></CardBody></Card>
    </div>
  );
}
