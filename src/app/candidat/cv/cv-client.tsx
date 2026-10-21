"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, FileText, Loader2, UploadCloud } from "lucide-react";
import { Alert, Badge, Button } from "@/components/ui";
import { uploadCvAction } from "@/features/cv/actions";
import { uploadDirect } from "@/features/documents/upload-client";
import { applyCvExtractionAction } from "@/features/ai/actions";
import type { CvExtraction } from "@/features/ai/schemas";
import { cn } from "@/lib/utils";

const isPdf = (f: File) => f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf");

/** Dépôt du CV : sélection ou glisser-déposer, envoi direct au stockage avec progression, puis vérification par le serveur. */
export function CvUploadForm({ maxMb }: { maxMb: number }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [pending, start] = useTransition();
  const [chosen, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  /** Contrôles avant l'envoi ; renvoie le fichier retenu ou null (message affiché). */
  const check = (f: File | undefined | null): File | null => {
    setMsg(null);
    if (!f) return null;
    if (!isPdf(f)) {
      setMsg({ ok: false, text: "Le CV doit être un fichier PDF. Depuis Word ou Google Docs : Fichier › Enregistrer sous (ou Télécharger) › PDF." });
      return null;
    }
    if (f.size > maxMb * 1024 * 1024) {
      setMsg({ ok: false, text: `Le fichier dépasse ${maxMb} Mo. Réduisez sa taille (par exemple en l'exportant sans images haute définition).` });
      return null;
    }
    return f;
  };
  const choose = (f: File | undefined) => setFile(check(f));

  const send = () => {
    // fichier choisi avant le chargement complet de la page (connexion lente) : lu directement dans le champ
    const file = check(chosen ?? input.current?.files?.[0]);
    if (!file) {
      if (!chosen && !input.current?.files?.length) setMsg({ ok: false, text: "Choisissez d'abord votre CV au format PDF." });
      return;
    }
    start(async () => {
      setProgress(0);
      const up = await uploadDirect(file, "cv", setProgress);
      if (!up.ok) {
        setProgress(null);
        return setMsg({ ok: false, text: up.error });
      }
      setProgress(100);
      let r;
      try {
        r = await uploadCvAction({ path: up.path, filename: file.name });
      } catch {
        r = { ok: false as const, error: "La vérification du fichier a été interrompue. Réessayez." };
      }
      setProgress(null);
      setMsg({ ok: r.ok, text: r.ok ? (r.message ?? "CV téléversé.") : r.error });
      if (r.ok) {
        setFile(null);
        if (input.current) input.current.value = "";
        router.refresh();
      }
    });
  };

  return (
    <div className="space-y-3">
      <input
        id="cv-file"
        ref={input}
        type="file"
        accept="application/pdf,.pdf"
        className="sr-only"
        onChange={(e) => choose(e.target.files?.[0])}
      />
      <label
        htmlFor="cv-file"
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          choose(e.dataTransfer.files?.[0]);
        }}
        className={cn(
          "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-8 text-center transition duration-300",
          dragging ? "scale-[1.01] border-gold-400 bg-gold-50" : "border-border bg-slate-50 hover:border-electric-300 hover:bg-white",
        )}
      >
        {chosen ? <FileText className="size-7 text-red-600" aria-hidden /> : <UploadCloud className={cn("size-7 text-electric-600", dragging && "animate-bounce-soft")} aria-hidden />}
        <span className="text-sm font-medium text-navy-900">{chosen ? chosen.name : dragging ? "Déposez votre CV ici" : "Choisir mon CV (PDF) ou le glisser ici"}</span>
        <span className="text-xs text-muted">
          {chosen ? `${(chosen.size / 1024 / 1024).toFixed(2).replace(".", ",")} Mo · cliquez pour changer de fichier` : `PDF uniquement · ${maxMb} Mo maximum · stockage privé`}
        </span>
      </label>
      {progress !== null && (
        <div role="progressbar" aria-label="Envoi du CV" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100} className="h-2 overflow-hidden rounded-full bg-slate-100">
          <div className="h-full rounded-full bg-gradient-to-r from-electric-500 to-gold-400 transition-[width] duration-300" style={{ width: `${progress}%` }} />
        </div>
      )}
      {msg && <Alert tone={msg.ok ? "success" : "error"}>{msg.text}</Alert>}
      <Button type="button" variant="secondary" disabled={pending} onClick={send}>
        {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <CheckCircle2 className="size-4" aria-hidden />}
        {pending ? (progress !== null && progress < 100 ? `Envoi… ${progress} %` : "Vérification…") : "Téléverser mon CV"}
      </Button>
    </div>
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
