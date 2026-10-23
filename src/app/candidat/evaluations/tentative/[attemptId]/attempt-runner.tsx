"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Clock, Loader2, Send } from "lucide-react";
import { Alert, Badge, Button, Card } from "@/components/ui";
import { cn } from "@/lib/utils";
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
      // Restauration du brouillon depuis un stockage externe après le montage (évite un écart d'hydratation)
      // eslint-disable-next-line react-hooks/set-state-in-effect
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
  const isAnswered = (qid: string) => (answers[qid]?.selected.length ?? 0) > 0 || (answers[qid]?.text.trim().length ?? 0) > 0;
  const answered = questions.filter((q) => isAnswered(q.id)).length;
  const progress = questions.length ? Math.round((answered / questions.length) * 100) : 0;

  // accès direct à une question depuis la barre de suivi (défilement doux sauf préférence contraire)
  const goTo = (e: React.MouseEvent<HTMLAnchorElement>, n: number) => {
    const el = document.getElementById(`question-${n}`);
    if (!el) return;
    e.preventDefault();
    const smooth = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollIntoView({ behavior: smooth ? "smooth" : "auto", block: "start" });
    el.querySelector<HTMLElement>("input, textarea")?.focus({ preventScroll: true });
  };

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
      <div className="sticky top-14 z-10 space-y-3 rounded-card border border-border bg-white px-4 py-3 shadow-sm lg:top-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span
            className={cn(
              "inline-flex items-center gap-2 rounded-full px-2.5 py-1 font-mono text-sm font-semibold tabular-nums transition-colors duration-500",
              remaining < 120000 ? "animate-pulse bg-red-50 text-red-700" : remaining < 300000 ? "bg-amber-50 text-amber-800" : "bg-navy-50 text-navy-900",
            )}
            role="timer"
            aria-live="off"
          >
            <Clock className="size-4" aria-hidden /> {String(mm).padStart(2, "0")}:{String(ss).padStart(2, "0")}
          </span>
          <span className="text-sm text-muted">
            <span className="font-semibold text-navy-900 tabular-nums">{answered}</span>/{questions.length} répondue(s)
          </span>
          <Button variant="secondary" onClick={submit} disabled={pending}>
            {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Send className="size-4" aria-hidden />} Soumettre
          </Button>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-label="Questions répondues" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}>
          <div className="h-full rounded-full bg-gradient-to-r from-gold-400 to-gold-300 transition-[width] duration-500 ease-out-expo" style={{ width: `${progress}%` }} />
        </div>
        {questions.length > 1 && (
          <nav aria-label="Accès aux questions" className="flex flex-wrap gap-1.5">
            {questions.map((q, idx) => {
              const done = isAnswered(q.id);
              return (
                <a
                  key={q.id}
                  href={`#question-${idx + 1}`}
                  onClick={(e) => goTo(e, idx + 1)}
                  aria-label={`Question ${idx + 1}${done ? " (répondue)" : ""}`}
                  className={cn(
                    "grid size-7 place-items-center rounded-full text-xs font-semibold tabular-nums transition-all duration-300 ease-spring hover:scale-110",
                    done ? "bg-navy-800 text-white" : "bg-slate-100 text-slate-600 hover:bg-navy-50",
                  )}
                >
                  {idx + 1}
                </a>
              );
            })}
          </nav>
        )}
      </div>
      {remaining === 0 && <Alert tone="warning">Le temps est écoulé : soumettez vos réponses maintenant (un court délai de grâce s&apos;applique).</Alert>}
      {error && <Alert tone="error">{error}</Alert>}
      {questions.map((q, idx) => (
        <Card key={q.id} id={`question-${idx + 1}`} className={cn("scroll-mt-56 p-5 transition-colors duration-500 lg:scroll-mt-44", isAnswered(q.id) && "border-navy-200")}>
          <fieldset>
            <legend className="mb-3 w-full">
              <span className="flex flex-wrap items-center gap-2 text-xs text-muted">
                <span
                  aria-hidden
                  className={cn(
                    "grid size-6 place-items-center rounded-full text-2xs font-bold transition-colors duration-300",
                    isAnswered(q.id) ? "bg-emerald-500 text-white" : "bg-navy-50 text-navy-700",
                  )}
                >
                  {isAnswered(q.id) ? <Check className="size-3.5 animate-pop-in" /> : idx + 1}
                </span>
                Question {idx + 1} · <Badge>{questionTypeLabel[q.type]}</Badge> · {q.points} point(s)
              </span>
              <span className="mt-2 block text-sm font-medium whitespace-pre-line text-navy-900">{q.prompt}</span>
            </legend>
            {q.type === "choix_unique" && (
              <div className="space-y-2">
                {q.options.map((o) => (
                  <label key={o.id} className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-border p-3 text-sm transition-colors duration-200 hover:border-navy-200 hover:bg-slate-50 has-[:checked]:border-electric-400 has-[:checked]:bg-electric-50 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-electric-500">
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
                    <label key={o.id} className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-border p-3 text-sm transition-colors duration-200 hover:border-navy-200 hover:bg-slate-50 has-[:checked]:border-electric-400 has-[:checked]:bg-electric-50 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-electric-500">
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
