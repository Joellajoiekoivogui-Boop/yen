import { notFound } from "next/navigation";
import { Clock, ListChecks, RotateCcw, Save, Scale, Target, UserRound } from "lucide-react";
import { Badge, Card, CardBody, CardHeader, PageHeader } from "@/components/ui";
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
        {a.max_attempts && <Badge tone="amber">{a.max_attempts} tentative(s) maximum</Badge>}
      </div>
      <Card>
        <CardHeader title="Avant de commencer" />
        <CardBody>
          <ul className="space-y-3 text-sm text-slate-700">
            <li className="flex gap-3"><Clock className="mt-0.5 size-4 shrink-0 text-navy-700" aria-hidden /><span>{a.duration_minutes} minutes. Le chronomètre démarre dès que vous commencez ; vous pouvez le masquer pendant l&apos;entretien.</span></li>
            <li className="flex gap-3"><Save className="mt-0.5 size-4 shrink-0 text-navy-700" aria-hidden /><span>Vos réponses sont enregistrées sur cet appareil au fur et à mesure, même si la connexion coupe.</span></li>
            <li className="flex gap-3"><Target className="mt-0.5 size-4 shrink-0 text-navy-700" aria-hidden /><span>Une compétence est démontrée quand son score atteint {Number(a.passing_score)} %. Elle s&apos;ajoute alors à votre profil.</span></li>
            <li className="flex gap-3"><RotateCcw className="mt-0.5 size-4 shrink-0 text-navy-700" aria-hidden /><span>Pas réussi du premier coup ? C&apos;est normal : vous saurez quoi revoir{a.cooldown_hours > 0 ? `, et vous pourrez réessayer après ${a.cooldown_hours} h` : ""}.{a.max_attempts ? ` Tentatives utilisées : ${count ?? 0} sur ${a.max_attempts}.` : count ? ` Tentatives déjà effectuées : ${count}.` : ""}</span></li>
            <li className="flex gap-3"><UserRound className="mt-0.5 size-4 shrink-0 text-navy-700" aria-hidden /><span>Répondez seul(e), sans aide extérieure : le résultat doit refléter ce que vous savez faire.</span></li>
          </ul>
        </CardBody>
      </Card>
      <Card>
        <CardHeader icon={ListChecks} title="Compétences visées" />
        <CardBody className="flex flex-wrap gap-1.5">
          {((a.assessment_skills ?? []) as unknown as { skills: { name: string } | null }[]).map((s, i) => <Badge key={i} tone="gold">{s.skills?.name}</Badge>)}
        </CardBody>
      </Card>
      <Card>
        <CardHeader icon={Scale} title="Barème et règles de correction" />
        <CardBody>
          <p className="text-sm whitespace-pre-line text-slate-700">{a.scoring_rules}</p>
          <p className="mt-3 text-xs text-muted">Version {a.version} de l&apos;entretien.</p>
        </CardBody>
      </Card>
      <StartAttemptButton assessmentId={a.id} />
    </div>
  );
}
