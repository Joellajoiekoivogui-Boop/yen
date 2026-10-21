import { redirect } from "next/navigation";
import { Hourglass } from "lucide-react";
import { Card, PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

const STATUS: Record<string, string> = {
  en_attente: "en attente de validation",
  actif: "validée",
  suspendu: "suspendue",
  inactif: "inactive",
  revoque: "retiré",
};

export default async function PendingPartnerPage() {
  const ctx = await requireUser();
  if (ctx.partnerOrganizationIds.length > 0) redirect("/partenaire");
  const supabase = await createClient();
  const { data } = await supabase.from("partner_memberships").select("status, organizations(name, status, portal_enabled)").eq("user_id", ctx.userId);
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader title="Espace partenaire" />
      <Card className="p-8 text-center">
        <Hourglass className="mx-auto size-10 text-amber-500" aria-hidden />
        <h2 className="mt-4 text-lg font-semibold text-navy-900">Demande en cours de validation</h2>
        <p className="mt-2 text-sm text-muted">L&apos;équipe YEN vérifie votre organisation avant d&apos;activer votre espace. Vous recevrez une notification dès l&apos;activation.</p>
        <ul className="mt-6 space-y-2 text-left text-sm">
          {(data ?? []).map((m, i) => {
            const o = m.organizations as unknown as { name: string; status: string; portal_enabled: boolean } | null;
            return <li key={i} className="rounded-md bg-slate-50 p-3"><strong>{o?.name}</strong> — organisation : {STATUS[o?.status ?? ""] ?? o?.status} · espace : {o?.portal_enabled ? "activé" : "pas encore activé"} · votre accès : {m.status === "actif" ? "actif" : STATUS[m.status] ?? m.status}</li>;
          })}
          {(data ?? []).length === 0 && <li className="text-muted">Aucune demande d&apos;organisation associée à ce compte. Contactez l&apos;équipe YEN.</li>}
        </ul>
      </Card>
    </div>
  );
}
