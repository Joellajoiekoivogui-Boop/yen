import { notFound } from "next/navigation";
import { Clock, ListChecks, Scale } from "lucide-react";
import { Alert, Badge, Card, CardBody, CardHeader, PageHeader } from "@/components/ui";
import { requireCandidate } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { isUuid } from "@/lib/utils";
import { levelLabel, type SkillLevel } from "@/lib/labels";
import { StartAttemptButton } from "./start-button";

export default async function AssessmentDetailPage(props: PageProps<"/candidat/evaluations/[id]">) {
  const { id } = await props.params;
  if (!isUuid(id)) notFound();
  const ctx = await requireCandidate();
  const supabase = await createClient();
  const { data: a } = await supabase
    .from("assessments")
    .select("id, title, description, level, duration_minutes, passing_score, scoring_rules, max_attempts, cooldown_hours, version, published_at, engineering_domains(name), assessment_skills(skills(name))")
    .eq("id", id)
    .eq("status", "publie")
    .maybeSingle();
  if (!a) notFound();
  const { count } = await supabase.from("assessment_attempts").select("id", { count: "exact", head: true }).eq("assessment_id", id).eq("candidate_id", ctx.candidateId);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader eyebrow={(a.engineering_domains as unknown as { name: string } | null)?.name} title={a.title} description={a.description} />
      <div className="flex flex-wrap gap-2">
        <Badge tone="blue">Niveau {levelLabel[a.level as SkillLevel]}</Badge>
        <Badge><Clock className="size-3" aria-hidden /> {a.duration_minutes} minutes</Badge>
        <Badge>Seuil de réussite : {Number(a.passing_score)} %</Badge>
        <Badge>Version {a.version}</Badge>
        {a.max_attempts && <Badge tone="amber">{a.max_attempts} tentative(s) maximum</Badge>}
      </div>
      <Card>
        <CardHeader icon={ListChecks} title="Compétences visées" />
        <CardBody className="flex flex-wrap gap-1.5">
          {((a.assessment_skills ?? []) as unknown as { skills: { name: string } | null }[]).map((s, i) => <Badge key={i} tone="gold">{s.skills?.name}</Badge>)}
        </CardBody>
      </Card>
      <Card>
        <CardHeader icon={Scale} title="Barème et règles de correction" />
        <CardBody><p className="text-sm whitespace-pre-line text-slate-700">{a.scoring_rules}</p></CardBody>
      </Card>
      <Alert tone="info">
        Le chronomètre démarre dès que vous commencez. Répondez seul(e) et sans aide extérieure. {a.cooldown_hours > 0 && `Délai entre deux tentatives : ${a.cooldown_hours} h.`} Tentatives déjà effectuées : {count ?? 0}.
      </Alert>
      <StartAttemptButton assessmentId={a.id} />
    </div>
  );
}
