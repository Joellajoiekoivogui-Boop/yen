import type { Metadata } from "next";
import Link from "next/link";
import { Badge, Card, PageHeader, Pagination, ScorePill, Table, TableEmpty, Td, Th } from "@/components/ui";
import { requireStaff } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { fillMissingSnapshots } from "@/features/applications/snapshots";
import { applicationStatusLabel, APPLICATION_STATUSES, type ApplicationStatus } from "@/lib/labels";
import { clampInt, formatDateTime, isUuid, param } from "@/lib/utils";

export const metadata: Metadata = { title: "Candidatures" };

export default async function AdminApplicationsPage(props: PageProps<"/admin/candidatures">) {
  const sp = await props.searchParams;
  await requireStaff("applications.manage");
  const supabase = await createClient();
  const status = param(sp.statut);
  const offer = param(sp.offre);
  const page = clampInt(param(sp.page), 1, 1, 1000);
  let q = supabase
    .from("applications")
    .select("id, offer_id, candidate_id, status, origin, updated_at, match_snapshot, visible_to_partner, job_offers(id, title, organizations(name)), candidate_profiles(id, public_code, profiles!candidate_profiles_user_id_fkey(first_name, last_name))", { count: "exact" })
    .order("updated_at", { ascending: false })
    .range((page - 1) * 30, page * 30 - 1);
  if (status && APPLICATION_STATUSES.includes(status as ApplicationStatus)) q = q.eq("status", status);
  if (offer && isUuid(offer)) q = q.eq("offer_id", offer);
  const { data, count } = await q;
  await fillMissingSnapshots(supabase, data ?? [], true);
  return (
    <div className="space-y-5">
      <PageHeader title="Candidatures" description="Toutes les candidatures et présélections, toutes offres confondues." />
      <div className="flex flex-wrap gap-3 text-sm">
        <Link href="/admin/candidatures" className={!status ? "font-semibold text-electric-700" : "text-muted"}>Toutes</Link>
        {APPLICATION_STATUSES.map((s) => <Link key={s} href={`/admin/candidatures?statut=${s}`} className={status === s ? "font-semibold text-electric-700" : "text-muted hover:text-navy-900"}>{applicationStatusLabel[s]}</Link>)}
      </div>
      <Card>
        <Table>
          <thead><tr><Th>Candidat</Th><Th>Offre</Th><Th>Origine</Th><Th>Compatibilité</Th><Th>Statut</Th><Th>Mise à jour</Th></tr></thead>
          <tbody>
            {(data ?? []).map((a) => {
              const c = a.candidate_profiles as unknown as { id: string; public_code: string; profiles: { first_name: string; last_name: string } };
              const o = a.job_offers as unknown as { id: string; title: string; organizations: { name: string } | null };
              const snap = a.match_snapshot as { score?: number } | null;
              return (
                <tr key={a.id}>
                  <Td><Link className="font-medium text-navy-900 hover:underline" href={`/admin/talents/${c.id}?onglet=candidatures`}>{c.profiles.first_name} {c.profiles.last_name}</Link><div className="font-mono text-xs text-muted">{c.public_code}</div></Td>
                  <Td><Link className="hover:underline" href={`/admin/offres/${o.id}?onglet=candidatures`}>{o.title}</Link><div className="text-xs text-muted">{o.organizations?.name}</div></Td>
                  <Td>{a.origin === "yen" ? "YEN" : "Candidat"}</Td>
                  <Td>{snap?.score != null ? <ScorePill score={snap.score} /> : "—"}</Td>
                  <Td><Badge tone="blue">{applicationStatusLabel[a.status as ApplicationStatus]}</Badge></Td>
                  <Td>{formatDateTime(a.updated_at)}</Td>
                </tr>
              );
            })}
            {(data ?? []).length === 0 && <TableEmpty colSpan={6}>Aucune candidature.</TableEmpty>}
          </tbody>
        </Table>
      </Card>
      <Pagination page={page} pageSize={30} total={count ?? 0} hrefFor={(p) => `/admin/candidatures?${new URLSearchParams({ ...(status ? { statut: status } : {}), ...(offer ? { offre: offer } : {}), page: String(p) })}`} />
    </div>
  );
}
