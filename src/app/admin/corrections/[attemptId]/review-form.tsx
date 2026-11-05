"use client";

import { useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Alert, Badge, Button, Card, CardBody, CardHeader } from "@/components/ui";
import { reviewAttemptAction } from "@/features/assessments/actions";

export interface ReviewItem {
  id: string;
  prompt: string;
  typeLabel: string;
  max: number;
  rubric: { criterion: string; points: number }[];
  answer: string | null;
  suggested: number | null;
  aiFeedback: string | null;
  /** bouton « Proposition IA » (rendu côté serveur) */
  aiAction?: ReactNode;
}

/**
 * Correction : la note et le commentaire se saisissent juste sous chaque réponse (plus d'allers-retours
 * entre la réponse et un formulaire en bas de page), avec la grille sous les yeux et le total en direct.
 * Le seuil de réussite n'est volontairement pas affiché ici : il ne doit pas influencer la note.
 */
export function ReviewForm({ attemptId, items, autoPoints, totalMax }: { attemptId: string; items: ReviewItem[]; autoPoints: number; totalMax: number }) {
  const router = useRouter();
  const [points, setPoints] = useState<Record<string, string>>(() => Object.fromEntries(items.map((a) => [a.id, a.suggested != null ? String(a.suggested) : ""])));
  const [comments, setComments] = useState<Record<string, string>>({});
  const [comment, setComment] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const graded = items.filter((a) => points[a.id] !== "" && !Number.isNaN(Number(points[a.id]))).length;
  const total = autoPoints + items.reduce((s, a) => s + (Number(points[a.id]) || 0), 0);

  const submit = () => {
    const grades = items.map((a) => ({ answerId: a.id, points: Number(points[a.id]), comment: comments[a.id] || null }));
    if (grades.some((g) => Number.isNaN(g.points) || points[g.answerId] === "")) return setMsg({ ok: false, text: "Toutes les questions doivent être notées." });
    if (items.some((a) => Number(points[a.id]) < 0 || Number(points[a.id]) > a.max)) return setMsg({ ok: false, text: "Une note dépasse le barème de sa question." });
    start(async () => {
      const r = await reviewAttemptAction({ attemptId, grades, comment: comment || null });
      setMsg({ ok: r.ok, text: r.ok ? (r.message ?? "Validé.") : r.error });
      if (r.ok) router.push("/admin/corrections");
    });
  };

  return (
    <div className="space-y-6">
      {items.map((a, i) => (
        <Card key={a.id}>
          <CardHeader title={`Question ${i + 1} — ${a.max} point(s)`} description={a.typeLabel} action={a.aiAction} />
          <CardBody className="space-y-3 text-sm">
            <p className="font-medium whitespace-pre-line text-navy-900">{a.prompt}</p>
            {a.rubric.length > 0 && (
              <ul className="list-disc pl-5 text-xs text-muted">
                {a.rubric.map((c, j) => (
                  <li key={j}>
                    {c.criterion} — {c.points} pt
                  </li>
                ))}
              </ul>
            )}
            <div className="rounded-lg bg-slate-50 p-3 whitespace-pre-wrap text-slate-800">{a.answer || <em className="text-muted">Pas de réponse</em>}</div>
            {a.suggested != null && (
              <p className="rounded-lg border border-violet-200 bg-violet-50 p-3 text-violet-900">
                <Badge tone="purple">
                  Proposition IA : {a.suggested} / {a.max}
                </Badge>{" "}
                {a.aiFeedback}
              </p>
            )}
            <div className="grid gap-3 border-t border-border pt-3 sm:grid-cols-[160px_1fr]">
              <label className="text-sm">
                <span className="mb-1 block font-medium text-navy-900">
                  Note question {i + 1} / {a.max}
                </span>
                <input type="number" inputMode="decimal" min={0} max={a.max} step={0.5} className="field-input" value={points[a.id]} onChange={(e) => setPoints({ ...points, [a.id]: e.target.value })} />
              </label>
              <label className="text-sm">
                <span className="mb-1 block font-medium text-navy-900">Commentaire pour le candidat</span>
                <input
                  className="field-input"
                  placeholder="Un point réussi, puis une piste concrète pour progresser"
                  value={comments[a.id] ?? ""}
                  onChange={(e) => setComments({ ...comments, [a.id]: e.target.value })}
                />
              </label>
            </div>
          </CardBody>
        </Card>
      ))}

      <Card>
        <CardHeader title="Validation" />
        <CardBody className="space-y-4">
          <p className="text-sm text-slate-700">
            <span className="font-semibold text-navy-900 tabular-nums">
              {graded}/{items.length}
            </span>{" "}
            question(s) notée(s) · total provisoire{" "}
            <span className="font-semibold text-navy-900 tabular-nums">
              {total} / {totalMax}
            </span>{" "}
            point(s){autoPoints > 0 ? `, dont ${autoPoints} corrigé(s) automatiquement` : ""}
          </p>
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-navy-900">Commentaire général</span>
            <textarea
              className="field-input"
              rows={3}
              placeholder="Ce qui est acquis, la priorité pour la suite et un encouragement"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
            />
          </label>
          {msg && <Alert tone={msg.ok ? "success" : "error"}>{msg.text}</Alert>}
          <Button variant="secondary" disabled={pending} onClick={submit}>
            {pending && <Loader2 className="size-4 animate-spin" aria-hidden />} Valider la correction
          </Button>
        </CardBody>
      </Card>
    </div>
  );
}
