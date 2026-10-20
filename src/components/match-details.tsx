import { AlertTriangle, CheckCircle2, CircleDashed, HelpCircle } from "lucide-react";
import type { MatchResult } from "@/features/matching/engine";
import { importanceLabel, levelLabel } from "@/lib/labels";
import { Badge, ProgressBar, ScorePill } from "@/components/ui";

const reqIcon = {
  satisfaite: <CheckCircle2 className="size-4 text-emerald-600" aria-label="Satisfaite" />,
  partielle: <CircleDashed className="size-4 text-amber-500" aria-label="Partielle" />,
  declaree_a_confirmer: <HelpCircle className="size-4 text-electric-500" aria-label="Déclarée, à confirmer" />,
  non_demontree: <AlertTriangle className="size-4 text-slate-400" aria-label="Non démontrée" />,
};

/** Explication complète d'un score : composantes, exigences, données manquantes, confiance. */
export function MatchDetails({ match, compact = false }: { match: MatchResult; compact?: boolean }) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <ScorePill score={match.score} confidence={match.confidenceLabel} />
        {match.floorScore !== match.score && <span className="text-xs text-muted">Score plancher (données manquantes = 0) : {match.floorScore}</span>}
        {!match.meetsMandatory && <Badge tone="amber" className="max-w-full whitespace-normal">Exigence(s) obligatoire(s) non démontrée(s) : {match.unmetMandatory.join(", ")}</Badge>}
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {match.components.map((c) => (
          <div key={c.key} className="rounded-md border border-border p-2.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-navy-900">{c.label}</span>
              <span className="text-muted">poids {c.weight}</span>
            </div>
            {c.value == null ? <p className="mt-1 text-xs font-medium text-amber-700">Données manquantes</p> : <ProgressBar value={c.value * 100} className="mt-1.5" tone="blue" label={c.label} />}
            {!compact && <p className="mt-1 text-[11px] leading-snug text-muted">{c.explanation}</p>}
          </div>
        ))}
      </div>
      {match.requirements.length > 0 && (
        <ul className="space-y-1.5">
          {match.requirements.map((r) => (
            <li key={r.skillId} className="flex items-start gap-2 text-sm">
              <span className="mt-0.5">{reqIcon[r.status]}</span>
              <span>
                <span className="font-medium text-navy-900">{r.skillName}</span>{" "}
                <span className="text-xs text-muted">
                  — attendu {levelLabel[r.requiredLevel]} ({importanceLabel[r.importance]})
                  {r.demonstratedLevel ? ` · démontré ${levelLabel[r.demonstratedLevel]}` : r.declaredLevel ? ` · déclaré ${levelLabel[r.declaredLevel]} (à confirmer)` : " · aucune preuve"}
                </span>
                {!compact && r.evidence.length > 0 && <span className="block text-[11px] text-muted">Preuves : {r.evidence.map((e) => e.label).join(" · ")}</span>}
              </span>
            </li>
          ))}
        </ul>
      )}
      {match.missingData.length > 0 && <p className="text-xs text-amber-800">Données manquantes : {match.missingData.join(" · ")}.</p>}
      <p className="text-[11px] text-muted italic">{match.disclaimer}</p>
    </div>
  );
}
