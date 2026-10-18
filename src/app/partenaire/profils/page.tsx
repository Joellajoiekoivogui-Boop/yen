import Link from "next/link";
import { Card, EmptyState, PageHeader, Table, Td, Th } from "@/components/ui";
import { requirePartner } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/utils";

export default async function SharedProfilesPage() {
  const ctx = await requirePartner();
  const supabase = await createClient();
  const { data } = await supabase
    .from("profile_shares")
    .select("id, candidate_id, reason, created_at, expires_at, job_offers(title)")
    .eq("organization_id", ctx.organizationId)
    .is("revoked_at", null)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false });
  return (
    <div className="space-y-5">
      <PageHeader title="Profils partagés par YEN" description="Accès temporaire, accordé avec le consentement du candidat et révocable à tout moment." />
      {(data ?? []).length === 0 ? <EmptyState title="Aucun profil partagé actuellement" /> : (
        <Card>
          <Table>
            <thead><tr><Th>Profil</Th><Th>Motif</Th><Th>Offre</Th><Th>Partagé le</Th><Th>Accès jusqu&apos;au</Th></tr></thead>
            <tbody>
              {(data ?? []).map((s) => (
                <tr key={s.id}>
                  <Td><Link className="text-electric-700 hover:underline" href={`/partenaire/profils/${s.candidate_id}`}>Voir le profil</Link></Td>
                  <Td className="max-w-xs">{s.reason}</Td>
                  <Td>{(s.job_offers as unknown as { title: string } | null)?.title ?? "—"}</Td>
                  <Td>{formatDate(s.created_at)}</Td>
                  <Td>{formatDate(s.expires_at)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      )}
    </div>
  );
}
