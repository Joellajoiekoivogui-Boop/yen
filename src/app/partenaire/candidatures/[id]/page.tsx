import { notFound } from "next/navigation";
import { PartnerCandidateCard } from "@/components/partner-candidate-card";
import { Alert, Badge, Card, CardBody, CardHeader, PageHeader } from "@/components/ui";
import { requirePartner } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { applicationStatusLabel, type ApplicationStatus } from "@/lib/labels";
import { formatDateTime, isUuid } from "@/lib/utils";
import { loadPartnerCandidateView } from "@/features/partners/queries";
import { PartnerFeedbackForm, PartnerInterviewForm, PartnerStatusForm } from "./forms";

export default async function PartnerApplicationPage(props: PageProps<"/partenaire/candidatures/[id]">) {
  const { id } = await props.params;
  if (!isUuid(id)) notFound();
  await requirePartner();
  const supabase = await createClient();
  // RLS : visible uniquement si l'offre appartient à l'organisation et que la candidature est transmise
  const { data: a } = await supabase
    .from("applications")
    .select("id, status, origin, motivation, submitted_at, candidate_id, job_offers(title, job_required_skills(skill_id, skills(name))), interviews(id, scheduled_at, mode, location, status)")
    .eq("id", id)
    .maybeSingle();
  if (!a) notFound();
  const view = await loadPartnerCandidateView(a.candidate_id);
  if (!view) notFound();
  const offer = a.job_offers as unknown as { title: string; job_required_skills: { skill_id: string; skills: { name: string } | null }[] };
  return (
    <div className="space-y-6">
      <PageHeader eyebrow={offer.title} title={`Candidature ${view.public_code}`} description={`${a.origin === "yen" ? "Profil proposé par YEN" : "Candidature spontanée"} · ${formatDateTime(a.submitted_at)}`} actions={<Badge tone="blue">{applicationStatusLabel[a.status as ApplicationStatus]}</Badge>} />
      {a.status === "retiree" && <Alert tone="warning">Le candidat a retiré sa candidature.</Alert>}
      <div className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-4 xl:col-span-2">
          {a.motivation && <Card><CardHeader title="Message du candidat" /><CardBody><p className="text-sm whitespace-pre-line text-slate-700">{a.motivation}</p></CardBody></Card>}
          <PartnerCandidateCard v={view} />
        </div>
        <div className="space-y-4">
          <Card><CardHeader title="Suivi du recrutement" /><CardBody><PartnerStatusForm applicationId={a.id} current={a.status} /></CardBody></Card>
          <Card>
            <CardHeader title="Entretiens" />
            <CardBody className="space-y-3">
              {((a.interviews ?? []) as { id: string; scheduled_at: string; mode: string; location: string | null; status: string }[]).map((i) => <p key={i.id} className="text-sm">{formatDateTime(i.scheduled_at)} — {i.mode} {i.location && `(${i.location})`} · {i.status}</p>)}
              <PartnerInterviewForm applicationId={a.id} />
            </CardBody>
          </Card>
          <Card><CardHeader title="Retour sur les compétences" description="Transmis à YEN, validé par un évaluateur avant d'être pris en compte." /><CardBody><PartnerFeedbackForm applicationId={a.id} skills={offer.job_required_skills.map((s) => ({ value: s.skill_id, label: s.skills?.name ?? "" }))} /></CardBody></Card>
        </div>
      </div>
    </div>
  );
}
