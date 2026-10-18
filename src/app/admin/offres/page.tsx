import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import { Badge, ButtonLink, Card, PageHeader, Pagination, Table, Td, Th } from "@/components/ui";
import { requireStaff } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { offerStatusLabel, OFFER_STATUSES, opportunityLabel, type OfferStatus, type OpportunityType } from "@/lib/labels";
import { clampInt, formatDate, param } from "@/lib/utils";

export const metadata: Metadata = { title: "Offres" };

export default async function AdminOffersPage(props: PageProps<"/admin/offres">) {
  const sp = await props.searchParams;
  await requireStaff("offers.manage");
  const supabase = await createClient();
  const status = param(sp.statut);
  const page = clampInt(param(sp.page), 1, 1, 1000);
  let q = supabase.from("job_offers").select("id, title, offer_type, status, deadline, positions, is_demo, created_at, organizations(name), applications(count)", { count: "exact" }).order("created_at", { ascending: false }).range((page - 1) * 25, page * 25 - 1);
  if (status && OFFER_STATUSES.includes(status as OfferStatus)) q = q.eq("status", status);
  const { data, count } = await q;
  return (
    <div className="space-y-5">
      <PageHeader title="Offres" description="Stages, emplois, alternances et missions. Les offres soumises par les partenaires apparaissent « En validation »." actions={<ButtonLink href="/admin/offres/nouvelle" variant="secondary"><Plus className="size-4" aria-hidden /> Nouvelle offre</ButtonLink>} />
      <div className="flex flex-wrap gap-2 text-sm">
        <Link href="/admin/offres" className={!status ? "font-semibold text-electric-700" : "text-muted"}>Toutes</Link>
        {OFFER_STATUSES.map((s) => <Link key={s} href={`/admin/offres?statut=${s}`} className={status === s ? "font-semibold text-electric-700" : "text-muted hover:text-navy-900"}>{offerStatusLabel[s]}</Link>)}
      </div>
      <Card>
        <Table>
          <thead><tr><Th>Offre</Th><Th>Organisation</Th><Th>Type</Th><Th>Date limite</Th><Th>Candidatures</Th><Th>Statut</Th></tr></thead>
          <tbody>
            {(data ?? []).map((o) => (
              <tr key={o.id} className="hover:bg-slate-50">
                <Td><Link href={`/admin/offres/${o.id}`} className="font-medium text-navy-900 hover:underline">{o.title}</Link> {o.is_demo && <Badge tone="purple">Démo</Badge>}</Td>
                <Td>{(o.organizations as unknown as { name: string } | null)?.name}</Td>
                <Td>{opportunityLabel[o.offer_type as OpportunityType]}</Td>
                <Td>{formatDate(o.deadline)}</Td>
                <Td className="tabular-nums">{(o.applications as unknown as { count: number }[])[0]?.count ?? 0}</Td>
                <Td><Badge tone={o.status === "publiee" ? "green" : o.status === "en_validation" ? "amber" : "neutral"}>{offerStatusLabel[o.status as OfferStatus]}</Badge></Td>
              </tr>
            ))}
            {(data ?? []).length === 0 && <tr><Td colSpan={6} className="text-center text-muted">Aucune offre.</Td></tr>}
          </tbody>
        </Table>
      </Card>
      <Pagination page={page} pageSize={25} total={count ?? 0} hrefFor={(p) => `/admin/offres?${new URLSearchParams({ ...(status ? { statut: status } : {}), page: String(p) })}`} />
    </div>
  );
}
