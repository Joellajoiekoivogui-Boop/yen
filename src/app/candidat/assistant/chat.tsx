"use client";

import { useRef, useState, useTransition } from "react";
import { Bot, Loader2, Send, User } from "lucide-react";
import { Alert, Button } from "@/components/ui";
import { assistantAction } from "@/features/ai/actions";

type Msg = { role: "user" | "assistant"; content: string };

const SUGGESTIONS = [
  "Explique-moi mes résultats d'évaluation.",
  "Quelles compétences dois-je développer pour mon métier visé ?",
  "Aide-moi à préparer un entretien de stage.",
  "Propose-moi un projet pratique pour démontrer mes compétences.",
];

export function AssistantChat() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const end = useRef<HTMLDivElement>(null);

  const send = (text: string) => {
    const content = text.trim();
    if (!content || pending) return;
    const next = [...messages, { role: "user" as const, content }];
    setMessages(next);
    setInput("");
    setError(null);
    start(async () => {
      const r = await assistantAction({ messages: next });
      if (r.ok && r.data) setMessages([...next, { role: "assistant", content: r.data.reply }]);
      else if (!r.ok) setError(r.error);
      setTimeout(() => end.current?.scrollIntoView({ behavior: "smooth" }), 50);
    });
  };

  return (
    <div className="flex min-h-[60vh] flex-col rounded-[var(--radius-card)] border border-border bg-white">
      <div className="flex-1 space-y-4 overflow-y-auto p-4" aria-live="polite">
        {messages.length === 0 && (
          <div className="grid gap-2 sm:grid-cols-2">
            {SUGGESTIONS.map((s) => (
              <button key={s} type="button" onClick={() => send(s)} className="rounded-lg border border-border p-3 text-left text-sm text-slate-700 hover:border-electric-300 hover:bg-electric-50/40">{s}</button>
            ))}
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`flex gap-3 ${m.role === "user" ? "justify-end" : ""}`}>
            {m.role === "assistant" && <span className="grid size-8 shrink-0 place-items-center rounded-full bg-gold-50 text-gold-600"><Bot className="size-4" aria-hidden /></span>}
            <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm whitespace-pre-wrap ${m.role === "user" ? "bg-navy-800 text-white" : "bg-slate-100 text-slate-800"}`}>{m.content}</div>
            {m.role === "user" && <span className="grid size-8 shrink-0 place-items-center rounded-full bg-navy-50 text-navy-700"><User className="size-4" aria-hidden /></span>}
          </div>
        ))}
        {pending && <p className="flex items-center gap-2 text-sm text-muted"><Loader2 className="size-4 animate-spin" aria-hidden /> L&apos;assistant rédige une réponse…</p>}
        {error && <Alert tone="error">{error}</Alert>}
        <div ref={end} />
      </div>
      <form className="flex gap-2 border-t border-border p-3" onSubmit={(e) => { e.preventDefault(); send(input); }}>
        <label htmlFor="assistant-input" className="sr-only">Votre message</label>
        <textarea id="assistant-input" rows={2} maxLength={4000} value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(input); } }} className="field-input flex-1 resize-none" placeholder="Posez votre question…" />
        <Button type="submit" variant="secondary" disabled={pending || !input.trim()} aria-label="Envoyer"><Send className="size-4" aria-hidden /></Button>
      </form>
    </div>
  );
}
