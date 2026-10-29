import type { Metadata } from "next";
import { CalendarClock, Send } from "lucide-react";
import { ActionButton } from "@/components/forms/action-button";
import { ApplicationStatusBadge, Card, CardBody, EmptyState, PageHeader } from "@/components/ui";
import { requireCandidate } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { applicationStatusLabel, opportunityLabel, type ApplicationStatus, type OpportunityType } from "@/lib/labels";
import { formatDate, formatDateTime } from "@/lib/utils";
import { withdrawApplicationAction } from "@/features/applications/actions";
import { loadOfferOrganizations } from "@/features/offers/organizations";

export const metadata: Metadata = { title: "Mes candidatures" };

export default async function ApplicationsPage() {
  const ctx = await requireCandidate();
  const supabase = await createClient();
  const { data: apps } = await supabase
    .from("applications")
    .select("id, status, origin, submitted_at, decision_reason, job_offers(id, title, offer_type, organization_id), application_events(id, from_status, to_status, note, created_at), interviews(id, scheduled_at, mode, location, status)")
    .eq("candidate_id", ctx.candidateId)
    .order("updated_at", { ascending: false });
  const orgs = await loadOfferOrganizations(supabase, (apps ?? []).map((a) => (a.job_offers as unknown as { organization_id: string }).organization_id));

  return (
    <div className="space-y-6">
      <PageHeader title="Mes candidatures" description="Suivez chaque étape : présélection, proposition au partenaire, entretiens de recrutement et décision." />
      {(apps ?? []).length === 0 && <EmptyState icon={Send} title="Aucune candidature" description="Consultez les offres et postulez à celles qui correspondent à votre profil." />}
      {(apps ?? []).map((a) => {
        const o = a.job_offers as unknown as { id: string; title: string; offer_type: OpportunityType; organization_id: string };
        const events = ((a.application_events ?? []) as { id: string; to_status: ApplicationStatus; note: string | null; created_at: string }[]).sort((x, y) => x.created_at.localeCompare(y.created_at));
        const interviews = (a.interviews ?? []) as { id: string; scheduled_at: string; mode: string; location: string | null; status: string }[];
        const status = a.status as ApplicationStatus;
        return (
          <Card key={a.id}>
            <CardBody className="space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-navy-900">{o.title}</p>
                  <p className="text-sm text-muted">{orgs.get(o.organization_id)?.name} · {opportunityLabel[o.offer_type]} · {a.origin === "yen" ? "Présélection YEN" : `Envoyée le ${formatDate(a.submitted_at)}`}</p>
                </div>
                <div className="flex items-center gap-2">
                  <ApplicationStatusBadge status={status} />
                  {!["acceptee", "refusee", "retiree"].includes(status) && (
                    <ActionButton variant="ghost" className="text-red-600 hover:bg-red-50" confirm="Retirer cette candidature ? L'organisation ne la verra plus." action={withdrawApplicationAction.bind(null, a.id)}>Retirer</ActionButton>
                  )}
                </div>
              </div>
              {a.decision_reason && ["acceptee", "refusee"].includes(status) && <p className="rounded-md bg-slate-50 p-2 text-sm text-slate-700">Motif communiqué : {a.decision_reason}</p>}
              {interviews.filter((i) => i.status === "programme").map((i) => (
                <p key={i.id} className="flex items-center gap-2 text-sm text-gold-800"><CalendarClock className="size-4" aria-hidden /> Entretien de recrutement le {formatDateTime(i.scheduled_at)} ({i.mode}{i.location ? ` — ${i.location}` : ""})</p>
              ))}
              <ol className="relative ml-2 space-y-2 border-l border-border pl-4">
                {events.map((e) => (
                  <li key={e.id} className="text-sm">
                    <span className="absolute -left-[5px] mt-1.5 size-2.5 rounded-full bg-electric-500" aria-hidden />
                    <span className="font-medium text-navy-900">{applicationStatusLabel[e.to_status]}</span>
                    <span className="text-xs text-muted"> · {formatDateTime(e.created_at)}</span>
                  </li>
                ))}
              </ol>
            </CardBody>
          </Card>
        );
      })}
    </div>
  );
}
