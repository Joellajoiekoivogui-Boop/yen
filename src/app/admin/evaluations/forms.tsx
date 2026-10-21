"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { z } from "@/lib/zod";
import { EntityForm } from "@/components/forms/entity-form";
import { Alert, Button } from "@/components/ui";
import { addQuestionAction, saveAssessmentAction } from "@/features/assessments/actions";
import { levelLabel, questionTypeLabel, type QuestionType } from "@/lib/labels";

type Opt = { value: string; label: string };

export function AssessmentForm({ defaults, domains, skills }: { defaults?: Record<string, unknown>; domains: Opt[]; skills: Opt[] }) {
  const router = useRouter();
  return (
    <EntityForm
      schema={z.object({ title: z.string().trim().min(3).max(200), domain_id: z.guid({ error: "Domaine requis." }), duration_minutes: z.number().int().min(1).max(480), passing_score: z.number().min(0).max(100), scoring_rules: z.string().trim().min(10, "Barème requis.").max(3000), cooldown_hours: z.number().int().min(0).max(720) }).passthrough()}
      defaultValues={{ level: "debutant", assessment_type: "questionnaire", duration_minutes: 20, passing_score: 60, cooldown_hours: 24, skill_ids: [], ...defaults }}
      action={async (v) => {
        const r = await saveAssessmentAction({ ...v, id: defaults?.id });
        if (r.ok && !defaults?.id && r.data) router.push(`/admin/evaluations/${r.data.id}`);
        return r;
      }}
      fields={[
        { name: "title", label: "Titre", required: true, colSpan: 2 },
        { name: "description", label: "Description", type: "textarea", rows: 2 },
        { name: "domain_id", label: "Domaine", type: "select", options: domains, required: true },
        { name: "level", label: "Niveau", type: "select", options: Object.entries(levelLabel).map(([value, label]) => ({ value, label })) },
        { name: "assessment_type", label: "Type", type: "select", options: [
          { value: "questionnaire", label: "Questionnaire" }, { value: "exercice_pratique", label: "Exercice pratique" }, { value: "etude_de_cas", label: "Étude de cas" },
          { value: "scenario", label: "Scénario professionnel" }, { value: "evaluation_formateur", label: "Évaluation par un formateur" }, { value: "portfolio", label: "Portfolio / dépôt de code" },
        ] },
        { name: "duration_minutes", label: "Durée indicative (min)", type: "number", min: 1, max: 480 },
        { name: "passing_score", label: "Seuil de réussite (%)", type: "number", min: 0, max: 100 },
        { name: "max_attempts", label: "Tentatives maximum (vide = illimité)", type: "number", min: 1, max: 50 },
        { name: "cooldown_hours", label: "Délai entre tentatives (h)", type: "number", min: 0, max: 720 },
        { name: "scoring_rules", label: "Barème explicite et règles de correction (affichés au candidat)", type: "textarea", rows: 3, required: true },
        { name: "skill_ids", label: "Compétences visées", type: "checkboxes", options: skills },
      ]}
    />
  );
}

export function QuestionForm({ assessmentId, skills }: { assessmentId: string; skills: Opt[] }) {
  const router = useRouter();
  const [type, setType] = useState<QuestionType>("choix_unique");
  const [prompt, setPrompt] = useState("");
  const [points, setPoints] = useState("1");
  const [skillId, setSkillId] = useState("");
  const [explanation, setExplanation] = useState("");
  const [options, setOptions] = useState([{ label: "", is_correct: true }, { label: "", is_correct: false }]);
  const [accepted, setAccepted] = useState("");
  const [rubric, setRubric] = useState([{ criterion: "", points: "1" }]);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const isChoice = type === "choix_unique" || type === "choix_multiple";
  const isOpen = type === "reponse_longue" || type === "etude_de_cas" || type === "exercice_pratique";

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <label className="text-sm"><span className="mb-1 block font-medium">Type</span>
          <select className="field-input" value={type} onChange={(e) => setType(e.target.value as QuestionType)}>{Object.entries(questionTypeLabel).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
        </label>
        <label className="text-sm"><span className="mb-1 block font-medium">Points</span><input type="number" min={0.5} step={0.5} className="field-input" value={points} onChange={(e) => setPoints(e.target.value)} /></label>
        <label className="text-sm"><span className="mb-1 block font-medium">Compétence évaluée</span>
          <select className="field-input" value={skillId} onChange={(e) => setSkillId(e.target.value)}><option value="">—</option>{skills.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}</select>
        </label>
      </div>
      <label className="block text-sm"><span className="mb-1 block font-medium">Énoncé</span><textarea className="field-input" rows={3} value={prompt} onChange={(e) => setPrompt(e.target.value)} /></label>
      {isChoice && (
        <div className="space-y-2">
          <p className="text-sm font-medium">Options (cochez la ou les bonnes réponses)</p>
          {options.map((o, i) => (
            <div key={i} className="flex items-center gap-2">
              <input type={type === "choix_unique" ? "radio" : "checkbox"} name="correct" checked={o.is_correct} onChange={(e) => setOptions(options.map((x, j) => ({ ...x, is_correct: type === "choix_unique" ? j === i : j === i ? e.target.checked : x.is_correct })))} className="accent-electric-600" aria-label="Bonne réponse" />
              <input className="field-input" value={o.label} onChange={(e) => setOptions(options.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} placeholder={`Option ${i + 1}`} />
              <Button variant="ghost" size="sm" onClick={() => setOptions(options.filter((_, j) => j !== i))} aria-label="Retirer"><Trash2 className="size-4" aria-hidden /></Button>
            </div>
          ))}
          <Button variant="outline" size="sm" onClick={() => setOptions([...options, { label: "", is_correct: false }])}><Plus className="size-4" aria-hidden /> Option</Button>
        </div>
      )}
      {type === "reponse_courte" && <label className="block text-sm"><span className="mb-1 block font-medium">Réponses acceptées (une par ligne)</span><textarea className="field-input" rows={2} value={accepted} onChange={(e) => setAccepted(e.target.value)} /></label>}
      {isOpen && (
        <div className="space-y-2">
          <p className="text-sm font-medium">Grille de correction (somme = points de la question)</p>
          {rubric.map((r, i) => (
            <div key={i} className="flex gap-2">
              <input className="field-input" value={r.criterion} onChange={(e) => setRubric(rubric.map((x, j) => (j === i ? { ...x, criterion: e.target.value } : x)))} placeholder="Critère observable" />
              <input className="field-input w-24" type="number" min={0.5} step={0.5} value={r.points} onChange={(e) => setRubric(rubric.map((x, j) => (j === i ? { ...x, points: e.target.value } : x)))} />
            </div>
          ))}
          <Button variant="outline" size="sm" onClick={() => setRubric([...rubric, { criterion: "", points: "1" }])}><Plus className="size-4" aria-hidden /> Critère</Button>
        </div>
      )}
      <label className="block text-sm"><span className="mb-1 block font-medium">Explication (affichée après correction)</span><input className="field-input" value={explanation} onChange={(e) => setExplanation(e.target.value)} /></label>
      {msg && <Alert tone={msg.ok ? "success" : "error"}>{msg.text}</Alert>}
      <Button variant="secondary" disabled={pending} onClick={() => start(async () => {
        const r = await addQuestionAction({
          assessmentId, question_type: type, prompt, points: Number(points), skill_id: skillId || null, explanation: explanation || null,
          options: isChoice ? options.filter((o) => o.label.trim()) : [],
          accepted_answers: type === "reponse_courte" ? accepted.split("\n").map((s) => s.trim()).filter(Boolean) : [],
          rubric: isOpen ? rubric.filter((r) => r.criterion.trim()).map((r) => ({ criterion: r.criterion, points: Number(r.points) })) : [],
        });
        setMsg({ ok: r.ok, text: r.ok ? (r.message ?? "Ajoutée.") : r.error });
        if (r.ok) { setPrompt(""); setExplanation(""); setAccepted(""); router.refresh(); }
      })}>{pending && <Loader2 className="size-4 animate-spin" aria-hidden />} Ajouter la question</Button>
    </div>
  );
}
