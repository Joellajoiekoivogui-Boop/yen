import "server-only";
import { cache } from "react";
import { DEFAULT_WEIGHTS, normalizeWeights, type Weights } from "@/features/matching/engine";
import { createClient } from "@/lib/supabase/server";

/**
 * Paramètres de la plateforme (aucun secret). Lisibles par les comptes connectés
 * (RLS) ; seules les clés listées ici sont lisibles sans connexion.
 */
const PUBLIC_KEYS = new Set(["documents.max_cv_size_mb"]);

/** Tous les paramètres lisibles, en une seule requête par affichage de page (partagée par tous les appels). */
const loadSettings = cache(async (): Promise<Map<string, unknown>> => {
  try {
    const supabase = await createClient();
    const { data } = await supabase.from("platform_settings").select("key, value");
    return new Map((data ?? []).map((r) => [r.key as string, r.value]));
  } catch {
    return new Map();
  }
});

async function readSetting(key: string): Promise<unknown> {
  return (await loadSettings()).get(key) ?? null;
}

export async function getPublicSetting(key: string): Promise<unknown> {
  if (!PUBLIC_KEYS.has(key)) throw new Error("Paramètre non public");
  return readSetting(key);
}

export async function getMaxCvBytes(): Promise<number> {
  const v = Number(await readSetting("documents.max_cv_size_mb"));
  const mb = Number.isFinite(v) && v > 0 && v <= 10 ? v : 5;
  return mb * 1024 * 1024;
}

export async function getDefaultWeights(): Promise<Weights> {
  return normalizeWeights((await readSetting("matching.default_weights")) as Partial<Weights> | null, DEFAULT_WEIGHTS);
}

export async function getAutoMaxLevel(): Promise<"debutant" | "intermediaire" | "avance"> {
  const v = await readSetting("assessments.auto_max_level");
  return v === "debutant" || v === "intermediaire" ? v : "avance";
}

export async function getInsertionWindowMonths(): Promise<number> {
  const v = Number(await readSetting("reports.insertion_window_months"));
  return Number.isFinite(v) && v > 0 ? v : 6;
}
