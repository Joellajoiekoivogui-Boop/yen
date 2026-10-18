import { notFound } from "next/navigation";
import { Building2, CalendarDays, MapPin, Users } from "lucide-react";
import { MatchDetails } from "@/components/match-details";
import { Alert, Badge, Card, CardBody, CardHeader, PageHeader } from "@/components/ui";
import { requireCandidate } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { applicationStatusLabel, levelLabel, opportunityLabel, type ApplicationStatus, type OpportunityType, type SkillLevel } from "@/lib/labels";
import { formatDate, isUuid } from "@/lib/utils";
import { computeMatch } from "@/features/matching/engine";
import { loadEvidence, loadOfferTarget } from "@/features/matching/loader";
import { loadOfferOrganizations } from "@/features/offers/organizations";
import { ApplyForm } from "./apply-form";

export default async function OfferDetailPage(props: PageProps<"/candidat/offres/[id]">) {
  const { id } = await props.params;
  if (!isUuid(id)) notFound();
  const ctx = await requireCandidate();
  const supabase = await createClient();
  const { data: o } = await supabase
    .from("job_offers")
    .select("id, title, description, offer_type, location, remote_policy, deadline, positions, education_level, min_experience_months, special_conditions, is_demo, domain_id, organization_id, job_required_skills(required_level, is_mandatory, skills(name))")
    .eq("id", id)
    .eq("status", "publiee")
    .maybeSingle();
  if (!o) notFound();
  const [target, app] = await Promise.all([
    loadOfferTarget(supabase, id),
    supabase.from("applications").select("id, status").eq("offer_id", id).eq("candidate_id", ctx.candidateId).maybeSingle(),
  ]);
  const evidence = await loadEvidence(supabase, ctx.candidateId, o.domain_id);
  const match = target && evidence ? computeMatch(target, evidence) : null;
  const org = (await loadOfferOrganizations(supabase, [o.organization_id])).get(o.organization_id) ?? { name: "Organisation", sector: "", city: null, description: "" };
  const expired = o.deadline != null && o.deadline < new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-6">
      <PageHeader eyebrow={opportunityLabel[o.offer_type as OpportunityType]} title={o.title} description={org.name} />
      {o.is_demo && <Alert tone="warning">Offre de démonstration fictive.</Alert>}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardBody className="space-y-4">
              <div className="flex flex-wrap gap-4 text-sm text-slate-600">
                <span className="flex items-center gap-1"><MapPin className="size-4" aria-hidden /> {o.location} ({o.remote_policy.replace("_", " ")})</span>
                <span className="flex items-center gap-1"><CalendarDays className="size-4" aria-hidden /> Date limite : {o.deadline ? formatDate(o.deadline) : "non précisée"}</span>
                <span className="flex items-center gap-1"><Users className="size-4" aria-hidden /> {o.positions} place(s)</span>
              </div>
              <p className="text-sm whitespace-pre-line text-slate-700">{o.description}</p>
              {o.special_conditions && <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-700"><strong>Conditions particulières :</strong> {o.special_conditions}</p>}
              <div className="text-sm text-slate-700">
                <p><strong>Niveau de formation :</strong> {o.education_level ?? "non précisé"}</p>
                <p><strong>Expérience souhaitée :</strong> {o.min_experience_months ? `${o.min_experience_months} mois` : "aucune exigée"}</p>
              </div>
              <div>
                <p className="mb-2 text-sm font-semibold text-navy-900">Compétences</p>
                <div className="flex flex-wrap gap-1.5">
                  {((o.job_required_skills ?? []) as unknown as { required_level: SkillLevel; is_mandatory: boolean; skills: { name: string } | null }[]).map((s, i) => (
                    <Badge key={i} tone={s.is_mandatory ? "blue" : "neutral"}>{s.skills?.name} · {levelLabel[s.required_level]}{s.is_mandatory ? " · obligatoire" : " · souhaitée"}</Badge>
                  ))}
                </div>
              </div>
            </CardBody>
          </Card>
          {match && (
            <Card>
              <CardHeader title="Ma compatibilité avec cette offre" />
              <CardBody><MatchDetails match={match} /></CardBody>
            </Card>
          )}
        </div>
        <div className="space-y-6">
          <Card>
            <CardHeader icon={Building2} title={org.name} description={[org.sector, org.city].filter(Boolean).join(" · ")} />
            <CardBody><p className="text-sm text-slate-600">{org.description || "—"}</p></CardBody>
          </Card>
          <Card>
            <CardHeader title="Candidature" />
            <CardBody>
              {app.data ? (
                <Alert tone="success">Candidature envoyée — statut : {applicationStatusLabel[app.data.status as ApplicationStatus]}.</Alert>
              ) : expired ? (
                <Alert tone="warning">La date limite est dépassée.</Alert>
              ) : (
                <>
                  <p className="mb-3 text-xs text-muted">En postulant, vous autorisez l&apos;organisation à consulter votre profil professionnel et votre CV pour cette offre (sans votre e-mail ni votre téléphone).</p>
                  <ApplyForm offerId={o.id} />
                </>
              )}
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  );
}
