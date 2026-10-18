import "server-only";
import { serverEnv } from "@/lib/env";

export type ScanResult =
  | { status: "sain"; details: string }
  | { status: "rejete"; details: string }
  | { status: "controle_basique_ok"; details: string };

/**
 * Analyse antivirus optionnelle. Si CLAMAV_SCAN_URL est défini, le fichier est
 * envoyé à un service REST ClamAV (ex. image « clamav-rest » auto-hébergée) qui
 * doit répondre en JSON { "infected": boolean, "viruses"?: string[] }.
 * Sans configuration, seul le contrôle structurel (pdf-validation.ts) est
 * appliqué et le document est marqué « contrôle basique » (pas « sain »).
 */
export async function scanFile(bytes: Uint8Array, filename: string): Promise<ScanResult> {
  const url = serverEnv().clamavScanUrl;
  if (!url) return { status: "controle_basique_ok", details: "Aucun antivirus configuré : contrôle structurel uniquement." };
  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(bytes)], { type: "application/pdf" }), filename);
  const res = await fetch(url, { method: "POST", body: form, signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`Service antivirus indisponible (${res.status})`);
  const json = (await res.json()) as { infected?: boolean; viruses?: string[] };
  if (json.infected) return { status: "rejete", details: `Menace détectée : ${(json.viruses ?? []).join(", ") || "inconnue"}` };
  return { status: "sain", details: "Analyse antivirus : aucune menace détectée." };
}
