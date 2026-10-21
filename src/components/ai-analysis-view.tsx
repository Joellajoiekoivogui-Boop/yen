import { Badge } from "@/components/ui";
import { confidenceLabel, levelLabel } from "@/lib/labels";
import { formatDateTime } from "@/lib/utils";
import type { ProfileAnalysis } from "@/features/ai/schemas";

export interface AnalysisRow {
  id: string;
  kind: string;
  status: string;
  output: unknown;
  error: string | null;
  created_at: string;
  model: string | null;
  provider: string;
  prompt_version: string;
  validation_status: string;
  correction_note: string | null;
  input_refs: unknown;
}

const validationLabel: Record<string, { label: string; tone: "neutral" | "green" | "amber" | "red" | "blue" }> = {
  en_attente: { label: "Non revue par YEN", tone: "neutral" },
  valide: { label: "Validée par YEN", tone: "green" },
  corrige: { label: "Corrigée par YEN", tone: "blue" },
  conteste: { label: "Contestée", tone: "amber" },
  rejete: { label: "Rejetée", tone: "red" },
};

function Sources({ ids }: { ids: string[] }) {
  return <span className="ml-1 text-[11px] text-muted">[{ids.map((s) => s.split(":")[0]).join(", ")}]</span>;
}

/** Affichage d'une analyse de profil : chaque conclusion montre le type de ses sources. */
export function ProfileAnalysisView({ row }: { row: AnalysisRow }) {
  const meta = (
    <p className="text-xs text-muted">
      {formatDateTime(row.created_at)} · {row.provider} / {row.model ?? "?"} · prompt {row.prompt_version}{" "}
      <Badge tone={validationLabel[row.validation_status]?.tone}>{validationLabel[row.validation_status]?.label}</Badge>
    </p>
  );
  if (row.status === "echoue") return <div className="space-y-1">{meta}<p className="text-sm text-red-700">Échec : {row.error}</p></div>;
  const o = row.output as ProfileAnalysis & { traceability?: { dropped: number } };
  const list = (title: string, items: { text: string; source_ids: string[] }[]) =>
    items.length > 0 && (
      <div>
        <p className="text-xs font-semibold tracking-wide text-muted uppercase">{title}</p>
        <ul className="mt-1 space-y-1 text-sm text-slate-700">{items.map((x, i) => <li key={i}>• {x.text}<Sources ids={x.source_ids} /></li>)}</ul>
      </div>
    );
  return (
    <div className="space-y-4">
      {meta}
      <div className="flex flex-wrap gap-2">
        <Badge tone="blue">Confiance : {confidenceLabel[o.confidence]}</Badge>
        {o.traceability && o.traceability.dropped > 0 && <Badge tone="amber">{o.traceability.dropped} conclusion(s) sans source écartée(s)</Badge>}
        {o.insufficient_data && <Badge tone="amber">Données insuffisantes</Badge>}
      </div>
      {o.insufficient_data_notes.length > 0 && <p className="text-sm text-amber-800">{o.insufficient_data_notes.join(" ")}</p>}
      {row.correction_note && <p className="rounded-md bg-slate-50 p-2 text-sm"><strong>Note YEN :</strong> {row.correction_note}</p>}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {list("Points forts", o.strengths)}
        {list("Lacunes détectées", o.gaps)}
        {list("Compétences démontrées", o.demonstrated_skills.map((d) => ({ text: `${d.skill} (${levelLabel[d.level]})`, source_ids: d.source_ids })))}
        {list("Compétences à confirmer", o.skills_to_confirm.map((d) => ({ text: `${d.skill} — ${d.reason}`, source_ids: d.source_ids })))}
        {list("Compétences déclarées", o.declared_skills.map((d) => ({ text: d.skill, source_ids: d.source_ids })))}
        {list("Compétences transférables", o.transferable_skills)}
        {list("Métiers compatibles", o.compatible_occupations.map((d) => ({ text: `${d.occupation_slug} — ${d.rationale}`, source_ids: d.source_ids })))}
        {list("Recommandations de formation", o.training_recommendations.map((d) => ({ text: `${d.title} : ${d.detail}`, source_ids: d.source_ids })))}
      </div>
      <p className="text-[11px] text-muted">Sources entre crochets : profil, cv, decl (déclaration), eval (preuve validée), projet, exp, form, cert.</p>
    </div>
  );
}
