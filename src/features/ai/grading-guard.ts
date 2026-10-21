/** Garde-fous déterministes sur les propositions de note de l'IA (logique pure). */

/**
 * Points par critère bornés par la grille de la question (et non par le maximum annoncé par le
 * modèle) ; un critère absent de la grille est borné par le total de la question.
 */
export function clampToRubric<C extends { criterion: string; points_awarded: number; max_points: number }>(criteria: C[], rubric: { criterion: string; points: number }[], questionPoints: number): C[] {
  const key = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const max = new Map(rubric.map((r) => [key(r.criterion), Number(r.points)]));
  return criteria.map((c) => {
    const limit = max.get(key(c.criterion)) ?? questionPoints;
    const awarded = Number.isFinite(c.points_awarded) ? c.points_awarded : 0;
    return { ...c, max_points: limit, points_awarded: Math.max(0, Math.min(limit, awarded)) };
  });
}
