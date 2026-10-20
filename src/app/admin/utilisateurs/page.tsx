import type { Metadata } from "next";
import { Badge, Card, CardBody, CardHeader, PageHeader, Pagination, Table, Td, Th } from "@/components/ui";
import { requireStaff } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { roleLabel, type AppRole } from "@/lib/labels";
import { clampInt, formatDate, formatDateTime, fullName, param } from "@/lib/utils";
import { UserRow } from "./forms";

export const metadata: Metadata = { title: "Utilisateurs et rôles" };

export default async function UsersPage(props: PageProps<"/admin/utilisateurs">) {
  const sp = await props.searchParams;
  const ctx = await requireStaff("users.manage");
  const supabase = await createClient();
  const page = clampInt(param(sp.page), 1, 1, 1000);
  const type = param(sp.type);
  const qText = param(sp.q)?.replace(/[%_,()]/g, "").slice(0, 80);
  let q = supabase.from("profiles").select("id, first_name, last_name, email, account_type, is_active, is_demo, created_at, deactivation_reason, user_roles!user_roles_user_id_fkey(role)", { count: "exact" }).order("created_at", { ascending: false }).range((page - 1) * 30, page * 30 - 1);
  if (type && ["candidate", "partner", "staff"].includes(type)) q = q.eq("account_type", type);
  if (qText) q = q.or(`email.ilike.%${qText}%,last_name.ilike.%${qText}%,first_name.ilike.%${qText}%`);
  const { data, count } = await q;
  const { data: deletions } = await supabase.from("audit_logs").select("id, actor_id, entity_id, details, created_at").eq("action", "deletion_requested").order("created_at", { ascending: false }).limit(20);

  return (
    <div className="space-y-6">
      <PageHeader title="Utilisateurs et rôles" description="Les rôles ne peuvent être modifiés que par un administrateur principal. Aucun utilisateur ne peut modifier son propre rôle." />
      <form method="get" className="flex flex-wrap items-end gap-3">
        <div><label htmlFor="q" className="mb-1 block text-xs font-medium text-muted">Recherche</label><input id="q" name="q" defaultValue={qText} className="field-input" placeholder="Nom ou e-mail" /></div>
        <div><label htmlFor="type" className="mb-1 block text-xs font-medium text-muted">Type de compte</label><select id="type" name="type" defaultValue={type ?? ""} className="field-input"><option value="">Tous</option><option value="candidate">Candidats</option><option value="partner">Partenaires</option><option value="staff">Personnel YEN</option></select></div>
        <button className="h-10 rounded-lg bg-navy-800 px-4 text-sm font-medium text-white">Filtrer</button>
      </form>
      <Card>
        <Table className="min-w-[900px]">
          <thead><tr><Th>Utilisateur</Th><Th>Type</Th><Th>Rôles</Th><Th>Inscription</Th><Th>Actions</Th></tr></thead>
          <tbody>
            {(data ?? []).map((u) => {
              const roles = ((u.user_roles ?? []) as { role: AppRole }[]).map((r) => r.role);
              return (
                <tr key={u.id}>
                  <Td><p className="font-medium text-navy-900">{fullName(u)}</p><p className="text-xs text-muted">{u.email}</p>{!u.is_active && <Badge tone="red" title={u.deactivation_reason ?? ""}>Désactivé</Badge>}{u.is_demo && <Badge tone="purple">Démo</Badge>}</Td>
                  <Td>{u.account_type}</Td>
                  <Td className="text-xs">{roles.map((r) => roleLabel[r]).join(", ") || "—"}</Td>
                  <Td>{formatDate(u.created_at)}</Td>
                  <Td><UserRow userId={u.id} roles={roles} active={u.is_active} canRoles={ctx.permissions.has("roles.manage")} isSelf={u.id === ctx.userId} isSuperAdmin={ctx.roles.includes("super_admin")} /></Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      </Card>
      <Pagination page={page} pageSize={30} total={count ?? 0} hrefFor={(p) => `/admin/utilisateurs?${new URLSearchParams({ ...(type ? { type } : {}), ...(qText ? { q: qText } : {}), page: String(p) })}`} />
      <Card>
        <CardHeader title="Demandes de suppression de compte" description="À traiter selon la procédure de suppression / anonymisation (docs/SECURITE.md)." />
        <CardBody>
          {(deletions ?? []).length === 0 ? <p className="text-sm text-muted">Aucune demande.</p> : (
            <ul className="space-y-2 text-sm">{(deletions ?? []).map((d) => <li key={d.id}>{formatDateTime(d.created_at)} — candidat <code className="text-xs">{d.entity_id}</code> {(d.details as { reason?: string }).reason && `: « ${(d.details as { reason?: string }).reason} »`}</li>)}</ul>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
