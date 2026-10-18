/**
 * Agrégation des compétences démontrées : seules les preuves VALIDES comptent.
 * Une compétence simplement mentionnée dans un CV ou déclarée par le candidat
 * n'est jamais considérée comme démontrée.
 */
import { LEVEL_RANK, skillSourceLabel, type SkillLevel } from "@/lib/labels";
import type { DemonstratedSkill, EvidenceRef } from "@/features/matching/engine";

export interface SkillAssessmentRow {
  id: string;
  skill_id: string;
  level: SkillLevel;
  score_percent: number | null;
  source: keyof typeof skillSourceLabel;
  status: "valide" | "en_attente" | "conteste" | "invalide";
  attempt_id: string | null;
  project_id: string | null;
  assessed_at: string;
}

export function aggregateDemonstrated(rows: SkillAssessmentRow[]): Record<string, DemonstratedSkill> {
  const out: Record<string, DemonstratedSkill> = {};
  for (const r of rows) {
    if (r.status !== "valide") continue;
    const ref: EvidenceRef = {
      type: r.source === "projet" ? "projet" : r.source === "evaluateur" ? "evaluateur" : r.source === "retour_partenaire" ? "retour_partenaire" : r.source === "exercice" ? "exercice" : "questionnaire",
      id: r.attempt_id ?? r.project_id ?? r.id,
      label: `${skillSourceLabel[r.source]}${r.score_percent != null ? ` (${Math.round(r.score_percent)} %)` : ""}`,
    };
    const cur = out[r.skill_id];
    if (!cur) {
      out[r.skill_id] = { level: r.level, bestScorePercent: r.score_percent, sources: [ref] };
    } else {
      if (LEVEL_RANK[r.level] > LEVEL_RANK[cur.level]) cur.level = r.level;
      if (r.score_percent != null && (cur.bestScorePercent == null || r.score_percent > cur.bestScorePercent)) cur.bestScorePercent = r.score_percent;
      cur.sources.push(ref);
    }
  }
  return out;
}

/** Mois cumulés entre deux dates (expériences), en ignorant les chevauchements. */
export function experienceMonths(items: { start_date: string; end_date: string | null; is_current?: boolean }[], now = new Date()): number {
  const ranges = items
    .map((e) => [new Date(e.start_date).getTime(), e.end_date ? new Date(e.end_date).getTime() : now.getTime()] as const)
    .filter(([s, e]) => Number.isFinite(s) && Number.isFinite(e) && e >= s)
    .sort((a, b) => a[0] - b[0]);
  let total = 0;
  let curStart = -1;
  let curEnd = -1;
  for (const [s, e] of ranges) {
    if (s > curEnd) {
      if (curEnd > curStart) total += curEnd - curStart;
      curStart = s;
      curEnd = e;
    } else if (e > curEnd) {
      curEnd = e;
    }
  }
  if (curEnd > curStart) total += curEnd - curStart;
  return Math.round(total / (1000 * 60 * 60 * 24 * 30.44));
}
