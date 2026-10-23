import type { Metadata } from "next";
import Form from "next/form";
import { Button, Card, PageHeader, Pagination, Table, Td, Th } from "@/components/ui";
import { requireStaff } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { clampInt, formatDateTime, param } from "@/lib/utils";

export const metadata: Metadata = { title: "Journal d'audit" };

export default async function AuditPage(props: PageProps<"/admin/audit">) {
  const sp = await props.searchParams;
  await requireStaff("audit.read");
  const supabase = await createClient();
  const page = clampInt(param(sp.page), 1, 1, 10000);
  const entity = param(sp.entite)?.replace(/[^a-z_]/g, "");
  const action = param(sp.action)?.replace(/[^a-z_]/g, "");
  let q = supabase.from("audit_logs").select("id, actor_id, action, entity_type, entity_id, details, created_at", { count: "exact" }).order("created_at", { ascending: false }).range((page - 1) * 50, page * 50 - 1);
  if (entity) q = q.eq("entity_type", entity);
  if (action) q = q.eq("action", action);
  const { data, count } = await q;
  const actorIds = [...new Set((data ?? []).map((d) => d.actor_id).filter(Boolean))] as string[];
  const { data: actors } = actorIds.length ? await supabase.from("profiles").select("id, email").in("id", actorIds) : { data: [] };
  const email = Object.fromEntries((actors ?? []).map((a) => [a.id, a.email]));
  return (
    <div className="space-y-5">
      <PageHeader title="Journal d'audit" description="Changements importants (rôles, documents, consentements, candidatures, placements, partages, analyses IA) et accès sensibles (téléchargements, exports). Le journal est en ajout seul et ne contient ni mot de passe ni secret." />
      <Form action="/admin/audit" className="flex flex-wrap items-end gap-3">
        <div><label htmlFor="entite" className="mb-1 block text-xs font-medium text-muted">Entité</label><input id="entite" name="entite" defaultValue={entity} className="field-input" placeholder="ex. user_roles" /></div>
        <div><label htmlFor="action" className="mb-1 block text-xs font-medium text-muted">Action</label><input id="action" name="action" defaultValue={action} className="field-input" placeholder="ex. update, document_downloaded" /></div>
        <Button type="submit">Filtrer</Button>
      </Form>
      <Card>
        <Table className="min-w-[900px]">
          <thead><tr><Th>Date</Th><Th>Acteur</Th><Th>Action</Th><Th>Entité</Th><Th>Détails</Th></tr></thead>
          <tbody>
            {(data ?? []).map((l) => (
              <tr key={l.id}>
                <Td className="whitespace-nowrap">{formatDateTime(l.created_at)}</Td>
                <Td className="text-xs">{l.actor_id ? email[l.actor_id] ?? l.actor_id : "Système / inscription"}</Td>
                <Td><code className="text-xs">{l.action}</code></Td>
                <Td className="text-xs">{l.entity_type}<div className="text-muted">{l.entity_id}</div></Td>
                <Td><details><summary className="cursor-pointer text-xs text-electric-700">Voir</summary><pre className="mt-1 max-h-48 max-w-md overflow-auto rounded bg-slate-50 p-2 text-2xs">{JSON.stringify(l.details, null, 2)}</pre></details></Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
      <Pagination page={page} pageSize={50} total={count ?? 0} hrefFor={(p) => `/admin/audit?${new URLSearchParams({ ...(entity ? { entite: entity } : {}), ...(action ? { action } : {}), page: String(p) })}`} />
    </div>
  );
}
