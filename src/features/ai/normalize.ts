/**
 * Normalisation des compétences (logique pure) : rattache un libellé libre
 * (issu d'un CV ou d'une saisie) à une compétence du catalogue, par nom exact
 * ou par synonyme. Aucune correspondance approximative risquée n'est faite :
 * un libellé non reconnu est signalé au candidat plutôt que deviné.
 */
import { normalizeText } from "@/lib/utils";

export interface CatalogSkill {
  id: string;
  name: string;
  aliases: string[];
}

const strip = (s: string) => normalizeText(s).replace(/[^a-z0-9+#.\s/-]/g, "").replace(/\s+/g, " ").trim();

export function buildSkillIndex(skills: CatalogSkill[]): Map<string, string> {
  const index = new Map<string, string>();
  for (const s of skills) {
    for (const label of [s.name, ...s.aliases]) {
      const key = strip(label);
      if (key && !index.has(key)) index.set(key, s.id);
    }
  }
  return index;
}

export function matchSkill(label: string, index: Map<string, string>): string | null {
  const key = strip(label);
  if (!key) return null;
  if (index.has(key)) return index.get(key)!;
  // Variante sans parenthèses ni version : "Python 3" -> "python", "React (Next.js)" -> "react"
  const simplified = key.replace(/\(.*?\)/g, "").replace(/\s+\d+(\.\d+)*$/, "").trim();
  return index.get(simplified) ?? null;
}

/** Vérifie qu'une citation figure réellement dans le texte source (tolérance aux espaces/accents/casse). */
export function quoteAppearsIn(quote: string, source: string): boolean {
  const q = normalizeText(quote).replace(/[^a-z0-9]+/g, " ").trim();
  if (q.length < 2) return false;
  const s = normalizeText(source).replace(/[^a-z0-9]+/g, " ");
  return s.includes(q);
}
