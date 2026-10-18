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
    .map((s) => `<source id="${s.id}" type="${s.type}" titre="${escapeAttr(s.label)}">\n${s.content.trim()}\n</source>`)
    .join("\n\n");
}

function escapeAttr(s: string) {
  return s.replace(/"/g, "'").replace(/[<>]/g, "");
}
