"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Alert, Button } from "@/components/ui";
import { reviewAttemptAction } from "@/features/assessments/actions";

export function ReviewForm({ attemptId, answers }: { attemptId: string; answers: { id: string; max: number; suggested: number | null }[] }) {
  const router = useRouter();
  const [points, setPoints] = useState<Record<string, string>>(() => Object.fromEntries(answers.map((a) => [a.id, a.suggested != null ? String(a.suggested) : ""])));
  const [comments, setComments] = useState<Record<string, string>>({});
  const [comment, setComment] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="space-y-4">
      {answers.map((a, i) => (
        <div key={a.id} id={`note-${a.id}`} className="grid gap-2 rounded-lg border border-border p-3 sm:grid-cols-[160px_1fr]">
          <label className="text-sm">
            <span className="mb-1 block font-medium text-navy-900">Note question {i + 1} / {a.max}</span>
            <input type="number" min={0} max={a.max} step={0.5} className="field-input" value={points[a.id]} onChange={(e) => setPoints({ ...points, [a.id]: e.target.value })} />
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-medium text-navy-900">Commentaire pour le candidat</span>
            <input className="field-input" value={comments[a.id] ?? ""} onChange={(e) => setComments({ ...comments, [a.id]: e.target.value })} />
          </label>
        </div>
      ))}
      <label className="block text-sm">
        <span className="mb-1 block font-medium text-navy-900">Commentaire général</span>
        <textarea className="field-input" rows={3} value={comment} onChange={(e) => setComment(e.target.value)} />
      </label>
      {msg && <Alert tone={msg.ok ? "success" : "error"}>{msg.text}</Alert>}
      <Button
        variant="secondary"
        disabled={pending}
        onClick={() => {
          const grades = answers.map((a) => ({ answerId: a.id, points: Number(points[a.id]), comment: comments[a.id] || null }));
          if (grades.some((g) => Number.isNaN(g.points) || points[g.answerId] === "")) return setMsg({ ok: false, text: "Toutes les questions doivent être notées." });
          start(async () => {
            const r = await reviewAttemptAction({ attemptId, grades, comment: comment || null });
            setMsg({ ok: r.ok, text: r.ok ? (r.message ?? "Validé.") : r.error });
            if (r.ok) router.push("/admin/corrections");
          });
        }}
      >
        {pending && <Loader2 className="size-4 animate-spin" aria-hidden />} Valider la correction
      </Button>
    </div>
  );
}
