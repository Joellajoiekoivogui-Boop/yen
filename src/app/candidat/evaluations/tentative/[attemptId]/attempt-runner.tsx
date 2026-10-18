"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Clock, Loader2, Send } from "lucide-react";
import { Alert, Badge, Button, Card } from "@/components/ui";
import { submitAttemptAction } from "@/features/assessments/actions";
import { questionTypeLabel, type QuestionType } from "@/lib/labels";

export interface RunnerQuestion {
  id: string;
  position: number;
  type: QuestionType;
  prompt: string;
  points: number;
  rubric: { criterion: string; points: number }[];
  options: { id: string; label: string }[];
}

type Answer = { selected: string[]; text: string };

export function AttemptRunner({ attemptId, deadline, questions }: { attemptId: string; deadline: string; questions: RunnerQuestion[] }) {
  const router = useRouter();
  const storageKey = `yen-attempt-${attemptId}`;
  const [answers, setAnswers] = useState<Record<string, Answer>>({});
  const [now, setNow] = useState(() => Date.now());
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const end = useMemo(() => new Date(deadline).getTime(), [deadline]);
  const remaining = Math.max(0, end - now);

  // Brouillon local (confort uniquement ; la correction se fait côté serveur)
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (raw) setAnswers(JSON.parse(raw));
    } catch { /* stockage indisponible */ }
  }, [storageKey]);
  useEffect(() => {
    try { window.localStorage.setItem(storageKey, JSON.stringify(answers)); } catch { /* ignore */ }
  }, [answers, storageKey]);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const set = (qid: string, patch: Partial<Answer>) => setAnswers((a) => ({ ...a, [qid]: { selected: a[qid]?.selected ?? [], text: a[qid]?.text ?? "", ...patch } }));
  const answered = questions.filter((q) => (answers[q.id]?.selected.length ?? 0) > 0 || (answers[q.id]?.text.trim().length ?? 0) > 0).length;

  const submit = () => {
    if (answered < questions.length && !window.confirm(`${questions.length - answered} question(s) sans réponse. Soumettre quand même ?`)) return;
    setError(null);
    start(async () => {
      const r = await submitAttemptAction({
        attemptId,
        answers: questions.map((q) => ({ questionId: q.id, selectedOptionIds: answers[q.id]?.selected ?? [], textAnswer: answers[q.id]?.text ?? null })),
      });
      if (r.ok) {
        try { window.localStorage.removeItem(storageKey); } catch { /* ignore */ }
        router.refresh();
      } else setError(r.error);
    });
  };

  const mm = Math.floor(remaining / 60000);
  const ss = Math.floor((remaining % 60000) / 1000);

  return (
    <div className="space-y-4">
      <div className="sticky top-14 z-10 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-white/95 px-4 py-3 shadow-sm backdrop-blur lg:top-2">
        <span className={`inline-flex items-center gap-2 font-mono text-sm font-semibold ${remaining < 120000 ? "text-red-600" : "text-navy-900"}`} role="timer" aria-live="off">
          <Clock className="size-4" aria-hidden /> {String(mm).padStart(2, "0")}:{String(ss).padStart(2, "0")}
        </span>
        <span className="text-sm text-muted">{answered}/{questions.length} répondue(s)</span>
        <Button variant="secondary" onClick={submit} disabled={pending}>
          {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Send className="size-4" aria-hidden />} Soumettre
        </Button>
      </div>
      {remaining === 0 && <Alert tone="warning">Le temps est écoulé : soumettez vos réponses maintenant (un court délai de grâce s&apos;applique).</Alert>}
      {error && <Alert tone="error">{error}</Alert>}
      {questions.map((q, idx) => (
        <Card key={q.id} className="p-5">
          <fieldset>
            <legend className="mb-3 w-full">
              <span className="flex flex-wrap items-center gap-2 text-xs text-muted">
                Question {idx + 1} · <Badge>{questionTypeLabel[q.type]}</Badge> · {q.points} point(s)
              </span>
              <span className="mt-2 block text-sm font-medium whitespace-pre-line text-navy-900">{q.prompt}</span>
            </legend>
            {q.type === "choix_unique" && (
              <div className="space-y-2">
                {q.options.map((o) => (
                  <label key={o.id} className="flex cursor-pointer items-start gap-2 rounded-md border border-border p-2.5 text-sm hover:bg-slate-50 has-[:checked]:border-electric-400 has-[:checked]:bg-electric-50">
                    <input type="radio" name={q.id} className="mt-0.5 accent-electric-600" checked={answers[q.id]?.selected[0] === o.id} onChange={() => set(q.id, { selected: [o.id] })} />
                    <span>{o.label}</span>
                  </label>
                ))}
              </div>
            )}
            {q.type === "choix_multiple" && (
              <div className="space-y-2">
                <p className="text-xs text-muted">Plusieurs réponses possibles. Une mauvaise réponse cochée annule la question.</p>
                {q.options.map((o) => {
                  const sel = answers[q.id]?.selected ?? [];
                  return (
                    <label key={o.id} className="flex cursor-pointer items-start gap-2 rounded-md border border-border p-2.5 text-sm hover:bg-slate-50 has-[:checked]:border-electric-400 has-[:checked]:bg-electric-50">
                      <input type="checkbox" className="mt-0.5 accent-electric-600" checked={sel.includes(o.id)} onChange={(e) => set(q.id, { selected: e.target.checked ? [...sel, o.id] : sel.filter((x) => x !== o.id) })} />
                      <span>{o.label}</span>
                    </label>
                  );
                })}
              </div>
            )}
            {q.type === "reponse_courte" && (
              <input className="field-input" maxLength={500} value={answers[q.id]?.text ?? ""} onChange={(e) => set(q.id, { text: e.target.value })} aria-label="Votre réponse" />
            )}
            {(q.type === "reponse_longue" || q.type === "etude_de_cas" || q.type === "exercice_pratique") && (
              <>
                {q.rubric.length > 0 && (
                  <ul className="mb-2 list-disc pl-5 text-xs text-muted">
                    {q.rubric.map((r, i) => <li key={i}>{r.criterion} ({r.points} pt)</li>)}
                  </ul>
                )}
                <textarea className="field-input" rows={10} maxLength={10000} value={answers[q.id]?.text ?? ""} onChange={(e) => set(q.id, { text: e.target.value })} aria-label="Votre réponse" />
                <p className="mt-1 text-xs text-muted">Correction par un évaluateur YEN selon la grille ci-dessus.</p>
              </>
            )}
          </fieldset>
        </Card>
      ))}
    </div>
  );
}
