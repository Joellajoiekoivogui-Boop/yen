import type { Metadata } from "next";
import Link from "next/link";
import { Badge, Card, CardBody, CardHeader, PageHeader, Table, Td, Th } from "@/components/ui";
import { requireStaff } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/utils";
import { OrganizationForm } from "./forms";

export const metadata: Metadata = { title: "Partenaires" };

const tone = { actif: "green", en_attente: "amber", suspendu: "red", inactif: "neutral" } as const;

export default async function PartnersAdminPage() {
  await requireStaff("partners.manage");
  const supabase = await createClient();
  const [orgs, domains, pending] = await Promise.all([
    supabase.from("organizations").select("id, name, sector, city, status, portal_enabled, is_public, is_demo, created_at, job_offers(count), partner_memberships(count)").order("created_at", { ascending: false }),
    supabase.from("engineering_domains").select("id, name").eq("is_active", true).order("position"),
    supabase.from("partner_memberships").select("id", { count: "exact", head: true }).eq("status", "en_attente"),
  ]);
  return (
    <div className="space-y-6">
      <PageHeader title="Partenaires" description={`Entreprises, ONG, bureaux d'études et institutions. ${pending.count ?? 0} demande(s) d'accès recruteur en attente.`} />
      <Card>
        <Table>
          <thead><tr><Th>Organisation</Th><Th>Secteur</Th><Th>Ville</Th><Th>Offres</Th><Th>Recruteurs</Th><Th>Espace</Th><Th>Statut</Th><Th>Depuis</Th></tr></thead>
          <tbody>
            {(orgs.data ?? []).map((o) => (
              <tr key={o.id}>
                <Td><Link href={`/admin/partenaires/${o.id}`} className="font-medium text-navy-900 hover:underline">{o.name}</Link> {o.is_demo && <Badge tone="purple">Démo</Badge>} {o.is_public && <Badge tone="teal">Public</Badge>}</Td>
                <Td>{o.sector}</Td><Td>{o.city}</Td>
                <Td className="tabular-nums">{(o.job_offers as unknown as { count: number }[])[0]?.count ?? 0}</Td>
                <Td className="tabular-nums">{(o.partner_memberships as unknown as { count: number }[])[0]?.count ?? 0}</Td>
                <Td>{o.portal_enabled ? "Activé" : "—"}</Td>
                <Td><Badge tone={tone[o.status as keyof typeof tone]}>{o.status}</Badge></Td>
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
