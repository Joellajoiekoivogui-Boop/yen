import type { Metadata } from "next";
import Link from "next/link";
import { Badge, Card, CardBody, CardHeader, PageHeader, Table, Td, Th } from "@/components/ui";
import { requireStaff } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { placementContractLabel } from "@/lib/labels";
import { formatDate, fullName, isUuid, param } from "@/lib/utils";
import { PlacementForm } from "./form";

export const metadata: Metadata = { title: "Placements" };

export default async function PlacementsPage(props: PageProps<"/admin/placements">) {
  const sp = await props.searchParams;
  await requireStaff("placements.manage");
  const preselected = param(sp.candidat);
  const supabase = await createClient();
  const [placements, cands, orgs, staff, apps] = await Promise.all([
    supabase.from("placements").select("id, organization_name, position_title, placement_type, contract_type, start_date, end_date, duration_months, confirmation_status, is_demo, candidate_profiles(id, public_code, profiles!candidate_profiles_user_id_fkey(first_name, last_name)), profiles!placements_follow_up_manager_id_fkey(first_name, last_name)").order("start_date", { ascending: false }).limit(200),
    supabase.from("candidate_profiles").select("id, public_code, profiles!candidate_profiles_user_id_fkey(first_name, last_name)").order("last_activity_at", { ascending: false }).limit(500),
    supabase.from("organizations").select("id, name").order("name"),
    supabase.from("user_roles").select("user_id, profiles!user_roles_user_id_fkey(first_name, last_name)").in("role", ["insertion_manager", "super_admin"]),
    supabase.from("applications").select("id, candidate_id, job_offers(title, organizations(name))").in("status", ["acceptee", "attente_decision", "entretien_programme", "proposee_partenaire"]).limit(300),
  ]);
  const candOpts = (cands.data ?? []).map((c) => ({ value: c.id, label: `${c.public_code} — ${fullName(c.profiles as unknown as { first_name: string; last_name: string })}` }));
  const appOpts = (apps.data ?? []).filter((a) => !preselected || a.candidate_id === preselected).map((a) => {
    const o = a.job_offers as unknown as { title: string; organizations: { name: string } | null };
    return { value: a.id, label: `${candOpts.find((c) => c.value === a.candidate_id)?.label.split(" — ")[0] ?? ""} · ${o.title} (${o.organizations?.name ?? ""})` };
  });
  const managers = [...new Map((staff.data ?? []).map((s) => [s.user_id, { value: s.user_id, label: fullName(s.profiles as unknown as { first_name: string; last_name: string }) }])).values()];

  return (
    <div className="space-y-6">
      <PageHeader title="Placements et suivi après placement" description="Les placements « déclarés » restent distincts des placements « confirmés » dans les rapports." />
      <Card>
        <Table>
          <thead><tr><Th>Candidat</Th><Th>Poste</Th><Th>Organisation</Th><Th>Contrat</Th><Th>Période</Th><Th>Suivi</Th><Th>Statut</Th></tr></thead>
          <tbody>
            {(placements.data ?? []).map((p) => {
              const c = p.candidate_profiles as unknown as { id: string; public_code: string; profiles: { first_name: string; last_name: string } };
              return (
                <tr key={p.id}>
                  <Td><Link href={`/admin/talents/${c.id}?onglet=suivi`} className="font-medium text-navy-900 hover:underline">{fullName(c.profiles)}</Link><div className="font-mono text-xs text-muted">{c.public_code}</div>{p.is_demo && <Badge tone="purple">Démo</Badge>}</Td>
                  <Td>{p.position_title}<div className="text-xs text-muted">{p.placement_type}</div></Td>
                  <Td>{p.organization_name}</Td>
                  <Td>{placementContractLabel[p.contract_type as keyof typeof placementContractLabel]}</Td>
                  <Td>{formatDate(p.start_date)}{p.end_date ? ` → ${formatDate(p.end_date)}` : p.duration_months ? ` (${p.duration_months} mois)` : ""}</Td>
                  <Td>{fullName(p.profiles as unknown as { first_name: string; last_name: string } | null)}</Td>
                  <Td><Badge tone={p.confirmation_status === "confirme" ? "green" : p.confirmation_status === "annule" ? "neutral" : "amber"}>{p.confirmation_status}</Badge></Td>
                </tr>
              );
            })}
            {(placements.data ?? []).length === 0 && <tr><Td colSpan={7} className="text-center text-muted">Aucun placement enregistré.</Td></tr>}
          </tbody>
        </Table>
      </Card>
      <Card>
        <CardHeader title="Enregistrer un placement" />
        <CardBody>
          <PlacementForm candidates={candOpts} organizations={(orgs.data ?? []).map((o) => ({ value: o.id, label: o.name }))} managers={managers} applications={appOpts} defaults={preselected && isUuid(preselected) ? { candidate_id: preselected } : undefined} />
        </CardBody>
      </Card>
    </div>
  );
}
