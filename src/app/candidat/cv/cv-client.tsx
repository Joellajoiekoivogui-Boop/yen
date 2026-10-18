"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Upload } from "lucide-react";
import { Alert, Badge, Button } from "@/components/ui";
import { uploadCvAction } from "@/features/cv/actions";
import { applyCvExtractionAction } from "@/features/ai/actions";
import type { CvExtraction } from "@/features/ai/schemas";

export function CvUploadForm({ maxMb }: { maxMb: number }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const file = input.current?.files?.[0];
        if (!file) return setMsg({ ok: false, text: "Choisissez un fichier PDF." });
        if (file.size > maxMb * 1024 * 1024) return setMsg({ ok: false, text: `Le fichier dépasse ${maxMb} Mo.` });
        const fd = new FormData();
        fd.append("file", file);
        setMsg(null);
        start(async () => {
          const r = await uploadCvAction(fd);
          setMsg({ ok: r.ok, text: r.ok ? (r.message ?? "CV téléversé.") : r.error });
          if (r.ok) {
            if (input.current) input.current.value = "";
            router.refresh();
          }
        });
      }}
      className="space-y-3"
    >
      <label htmlFor="cv-file" className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border bg-slate-50 px-4 py-8 text-center hover:border-electric-300">
        <Upload className="size-6 text-electric-600" aria-hidden />
        <span className="text-sm font-medium text-navy-900">Sélectionner un CV au format PDF</span>
        <span className="text-xs text-muted">{maxMb} Mo maximum · le type réel du fichier est vérifié · stockage privé</span>
        <input id="cv-file" ref={input} type="file" accept="application/pdf,.pdf" className="text-xs" />
      </label>
      {msg && <Alert tone={msg.ok ? "success" : "error"}>{msg.text}</Alert>}
      <Button type="submit" variant="secondary" disabled={pending}>
        {pending && <Loader2 className="size-4 animate-spin" aria-hidden />} Téléverser
      </Button>
    </form>
  );
}

/** Validation par le candidat des informations extraites : rien n'est ajouté sans sélection explicite. */
export function ExtractionReview({ analysisId, data }: { analysisId: string; data: CvExtraction }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [sel, setSel] = useState<Record<string, Set<number>>>({});
  const [summary, setSummary] = useState(false);

  const toggle = (group: string, i: number) =>
    setSel((s) => {
      const next = new Set(s[group] ?? []);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return { ...s, [group]: next };
    });
  const group = (key: keyof CvExtraction, title: string, render: (x: never) => string) => {
    const arr = (data[key] as unknown[]) ?? [];
    if (!arr.length) return null;
    return (
      <fieldset className="rounded-lg border border-border p-3">
        <legend className="px-1 text-sm font-semibold text-navy-900">{title}</legend>
        <ul className="space-y-1.5">
          {arr.map((x, i) => (
            <li key={i}>
              <label className="flex items-start gap-2 text-sm text-slate-700">
                <input type="checkbox" className="mt-0.5 size-4 accent-electric-600" checked={sel[key]?.has(i) ?? false} onChange={() => toggle(key, i)} />
                <span>{render(x as never)}</span>
              </label>
            </li>
          ))}
        </ul>
      </fieldset>
    );
  };

  return (
    <div className="space-y-3">
      <Alert tone="info">Cochez uniquement les informations exactes. Les compétences ajoutées seront « déclarées » : elles ne deviennent « démontrées » qu&apos;après une évaluation.</Alert>
      {data.warnings.length > 0 && <Alert tone="warning" title="Points d'attention">{data.warnings.join(" ")}</Alert>}
      {data.summary && (
        <label className="flex items-start gap-2 rounded-lg border border-border p-3 text-sm">
          <input type="checkbox" className="mt-0.5 size-4 accent-electric-600" checked={summary} onChange={(e) => setSummary(e.target.checked)} />
          <span><strong>Résumé :</strong> {data.summary}</span>
        </label>
      )}
      {group("education", "Formations", (e: CvExtraction["education"][number]) => `${e.degree} — ${e.institution}${e.end_year ? ` (${e.end_year})` : ""}`)}
      {group("experiences", "Expériences", (e: CvExtraction["experiences"][number]) => `${e.title} — ${e.organization} (${e.start_date ?? "date inconnue"} → ${e.is_current ? "aujourd'hui" : e.end_date ?? "?"})`)}
      {group("skills", "Compétences mentionnées", (s: CvExtraction["skills"][number]) => `${s.name} — « ${s.evidence_quote} »`)}
      {group("certifications", "Certifications", (c: CvExtraction["certifications"][number]) => `${c.name}${c.issuer ? ` — ${c.issuer}` : ""}`)}
      {group("projects", "Projets", (p: CvExtraction["projects"][number]) => `${p.title}${p.technologies.length ? ` (${p.technologies.join(", ")})` : ""}`)}
      {group("languages", "Langues", (l: CvExtraction["languages"][number]) => `${l.language} (${l.proficiency})`)}
      {data.tools.length > 0 && <p className="text-xs text-muted">Outils mentionnés : {data.tools.map((t) => <Badge key={t} className="mr-1">{t}</Badge>)}</p>}
      {data.measurable_achievements.length > 0 && <p className="text-xs text-muted">Réalisations mesurables relevées : {data.measurable_achievements.join(" · ")}</p>}
      {msg && <Alert tone={msg.ok ? "success" : "error"}>{msg.text}</Alert>}
      <Button
        variant="secondary"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const payload: Record<string, unknown> = { analysisId, summary };
            for (const [k, v] of Object.entries(sel)) payload[k] = [...v];
            const r = await applyCvExtractionAction(payload);
            setMsg({ ok: r.ok, text: r.ok ? (r.message ?? "Ajouté.") : r.error });
            if (r.ok) router.refresh();
          })
        }
      >
        {pending && <Loader2 className="size-4 animate-spin" aria-hidden />} Ajouter la sélection à mon profil
      </Button>
    </div>
  );
}
