import { notFound } from "next/navigation";
import { ActionButton } from "@/components/forms/action-button";
import { Badge, Card, CardBody, CardHeader, PageHeader } from "@/components/ui";
import { requireStaff } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { isUuid } from "@/lib/utils";
import { questionTypeLabel, type QuestionType } from "@/lib/labels";
import { deleteQuestionAction, setAssessmentStatusAction } from "@/features/assessments/actions";
import { AssessmentForm, QuestionForm } from "../forms";

export default async function AdminAssessmentPage(props: PageProps<"/admin/evaluations/[id]">) {
  const { id } = await props.params;
  if (!isUuid(id)) notFound();
  await requireStaff("assessments.manage");
  const supabase = await createClient();
  const [{ data: a }, questions, domains, skills] = await Promise.all([
    supabase.from("assessments").select("*, assessment_skills(skill_id)").eq("id", id).maybeSingle(),
    supabase.from("assessment_questions").select("id, position, question_type, prompt, points, accepted_answers, rubric, explanation, skills(name), assessment_options(id, label, is_correct, position)").eq("assessment_id", id).order("position"),
    supabase.from("engineering_domains").select("id, name").eq("is_active", true).order("position"),
    supabase.from("skills").select("id, name").eq("is_active", true).order("name"),
  ]);
  if (!a) notFound();
  const skillOpts = (skills.data ?? []).map((d) => ({ value: d.id, label: d.name }));
  return (
    <div className="space-y-6">
      <PageHeader
        title={a.title}
        description={`Version ${a.version}`}
        actions={
          <div className="flex items-center gap-2">
            <Badge tone={a.status === "publie" ? "green" : "amber"}>{a.status}</Badge>
            {a.status !== "publie" && <ActionButton variant="secondary" action={setAssessmentStatusAction.bind(null, id, "publie")}>Publier</ActionButton>}
            {a.status === "publie" && <ActionButton action={setAssessmentStatusAction.bind(null, id, "brouillon")}>Dépublier</ActionButton>}
            {a.status !== "archive" && <ActionButton variant="ghost" action={setAssessmentStatusAction.bind(null, id, "archive")}>Archiver</ActionButton>}
          </div>
        }
      />
      <Card>
        <CardHeader title="Paramètres" />
        <CardBody>
          <AssessmentForm
            domains={(domains.data ?? []).map((d) => ({ value: d.id, label: d.name }))}
            skills={skillOpts}
            defaults={{ id: a.id, title: a.title, description: a.description, domain_id: a.domain_id, level: a.level, assessment_type: a.assessment_type, duration_minutes: a.duration_minutes, passing_score: Number(a.passing_score), max_attempts: a.max_attempts, cooldown_hours: a.cooldown_hours, scoring_rules: a.scoring_rules, skill_ids: (a.assessment_skills as { skill_id: string }[]).map((s) => s.skill_id) }}
          />
        </CardBody>
      </Card>
      <Card>
        <CardHeader title={`Questions (${questions.data?.length ?? 0})`} description="Les clés de correction ne sont jamais transmises aux candidats." />
        <CardBody className="space-y-3">
          {(questions.data ?? []).map((q, i) => (
            <div key={q.id} className="rounded-lg border border-border p-3 text-sm">
              <div className="flex justify-between gap-3">
                <p className="font-medium whitespace-pre-line text-navy-900">{i + 1}. {q.prompt}</p>
                <ActionButton variant="ghost" confirm="Supprimer cette question ?" action={deleteQuestionAction.bind(null, q.id, id)}>Supprimer</ActionButton>
              </div>
              <p className="text-xs text-muted">{questionTypeLabel[q.question_type as QuestionType]} · {Number(q.points)} pt · {(q.skills as unknown as { name: string } | null)?.name ?? "sans compétence"}</p>
              {(q.assessment_options as { id: string; label: string; is_correct: boolean; position: number }[]).sort((x, y) => x.position - y.position).map((o) => <p key={o.id} className={`text-xs ${o.is_correct ? "font-semibold text-gold-700" : "text-slate-600"}`}>{o.is_correct ? "✓" : "○"} {o.label}</p>)}
              {q.accepted_answers.length > 0 && <p className="text-xs text-gold-700">Acceptées : {q.accepted_answers.join(" | ")}</p>}
              {(q.rubric as { criterion: string; points: number }[]).length > 0 && <p className="text-xs text-slate-600">Grille : {(q.rubric as { criterion: string; points: number }[]).map((r) => `${r.criterion} (${r.points})`).join(" · ")}</p>}
            </div>
          ))}
          <div className="rounded-lg bg-slate-50 p-4"><p className="mb-3 text-sm font-semibold text-navy-900">Ajouter une question</p><QuestionForm assessmentId={id} skills={skillOpts} /></div>
        </CardBody>
      </Card>
    </div>
  );
}
