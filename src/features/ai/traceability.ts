/**
 * Traçabilité des conclusions IA (logique pure).
 * Toute conclusion qui ne cite pas au moins une source réellement fournie est
 * écartée et comptabilisée : l'IA ne peut pas « inventer » une conclusion.
 */
export interface SourceDoc {
  id: string;
  type: "profil" | "cv" | "evaluation" | "projet" | "experience" | "formation" | "certification" | "evaluateur" | "competence_declaree" | "retour_partenaire";
  label: string;
  content: string;
  /** Projet vérifié par YEN (seul un projet vérifié peut démontrer une compétence) */
  verified?: boolean;
}

type WithSources = { source_ids: string[] };

export interface TraceReport {
  kept: number;
  dropped: number;
  droppedItems: string[];
}

/** Filtre récursivement les tableaux d'objets portant `source_ids`. */
export function enforceTraceability<T>(output: T, knownIds: Set<string>): { output: T; report: TraceReport } {
  const report: TraceReport = { kept: 0, dropped: 0, droppedItems: [] };

  const visit = (value: unknown): unknown => {
    if (Array.isArray(value)) {
      const out: unknown[] = [];
      for (const item of value) {
        if (item && typeof item === "object" && "source_ids" in (item as object)) {
          const ids = ((item as WithSources).source_ids ?? []).filter((id) => knownIds.has(id));
          if (ids.length === 0) {
            report.dropped++;
            report.droppedItems.push(JSON.stringify(item).slice(0, 200));
            continue;
          }
          report.kept++;
          out.push({ ...(visit(item) as object), source_ids: ids });
        } else {
          out.push(visit(item));
        }
      }
      return out;
    }
    if (value && typeof value === "object") {
      const o: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(value)) o[k] = k === "source_ids" ? v : visit(v);
      return o;
    }
    return value;
  };

  return { output: visit(output) as T, report };
}

/** Sérialise les sources pour le prompt, avec des identifiants courts et stables. */
export function renderSources(sources: SourceDoc[]): string {
  return sources
    .map((s) => `<source id="${s.id}" type="${s.type}" titre="${escapeAttr(s.label)}">\n${escapeForPrompt(s.content.trim())}\n</source>`)
    .join("\n\n");
}

/**
 * Neutralise les chevrons d'un texte fourni par un utilisateur (CV, profil, réponse, offre)
 * avant de l'insérer entre des balises du prompt : sans cela, le texte pourrait fermer sa
 * balise et ouvrir une fausse <source type="evaluation"> (injection de consignes).
 */
export function escapeForPrompt(text: string): string {
  return text.replace(/</g, "‹").replace(/>/g, "›");
}

/** Types de sources qui démontrent une compétence (une simple mention ou déclaration ne suffit pas). */
const DEMONSTRATING_TYPES = new Set<SourceDoc["type"]>(["evaluation", "evaluateur", "retour_partenaire"]);

/**
 * Une compétence « démontrée » doit citer au moins une preuve validée : évaluation, évaluateur,
 * retour partenaire ou projet vérifié par YEN. La règle figure dans le prompt, mais elle est
 * appliquée ici de façon déterministe, quoi que réponde le modèle.
 */
export function enforceDemonstratedEvidence<T extends { source_ids: string[] }>(items: T[], sources: SourceDoc[]): { kept: T[]; dropped: T[] } {
  const proving = new Set(sources.filter((s) => DEMONSTRATING_TYPES.has(s.type) || (s.type === "projet" && s.verified)).map((s) => s.id));
  const kept: T[] = [];
  const dropped: T[] = [];
  for (const item of items) (item.source_ids.some((id) => proving.has(id)) ? kept : dropped).push(item);
  return { kept, dropped };
}

function escapeAttr(s: string) {
  return s.replace(/"/g, "'").replace(/[<>]/g, "");
}
