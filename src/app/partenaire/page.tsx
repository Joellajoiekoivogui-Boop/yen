import Link from "next/link";
import { Briefcase, Send, Users } from "lucide-react";
import { ApplicationStatusBadge, Card, CardBody, CardHeader, PageHeader, StatCard } from "@/components/ui";
import { requirePartner } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

import { formatDateTime } from "@/lib/utils";

export default async function PartnerDashboard() {
  const ctx = await requirePartner();
  const supabase = await createClient();
  const [org, offers, apps, shares] = await Promise.all([
    supabase.from("organizations").select("name").eq("id", ctx.organizationId).single(),
    supabase.from("job_offers").select("id, status").eq("organization_id", ctx.organizationId),
    supabase.from("applications").select("id, status, updated_at, job_offers!inner(title, organization_id)").eq("job_offers.organization_id", ctx.organizationId).order("updated_at", { ascending: false }).limit(8),
    supabase.from("profile_shares").select("id", { count: "exact", head: true }).eq("organization_id", ctx.organizationId).is("revoked_at", null).gt("expires_at", new Date().toISOString()),
  ]);
  return (
    <div className="space-y-6">
      <PageHeader title={org.data?.name ?? "Espace partenaire"} description="Vous voyez uniquement les candidatures reçues sur vos offres et les profils que YEN vous a partagés avec le consentement des candidats." />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Offres publiées" value={(offers.data ?? []).filter((o) => o.status === "publiee").length} hint={`${(offers.data ?? []).filter((o) => o.status === "en_validation").length} en validation`} icon={Briefcase} />
        <StatCard label="Candidatures visibles" value={(apps.data ?? []).length} icon={Send} tone="gold" />
        <StatCard label="Profils partagés actifs" value={shares.count ?? 0} icon={Users} tone="navy" />
      </div>
      <Card>
        <CardHeader title="Dernières candidatures" action={<Link href="/partenaire/candidatures" className="text-sm text-electric-700 hover:underline">Tout voir</Link>} />
        <CardBody className="space-y-2">
          {(apps.data ?? []).length === 0 && <p className="text-sm text-muted">Aucune candidature pour l&apos;instant.</p>}
          {(apps.data ?? []).map((a) => (
            <Link key={a.id} href={`/partenaire/candidatures/${a.id}`} className="flex items-center justify-between rounded-md border border-border p-3 text-sm hover:bg-slate-50">
              <span>{(a.job_offers as unknown as { title: string }).title}<span className="block text-xs text-muted">{formatDateTime(a.updated_at)}</span></span>
              <ApplicationStatusBadge status={a.status} />
            </Link>
          ))}
        </CardBody>
      </Card>
    </div>
  );
}
