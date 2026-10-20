import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { computeMatch } from "@/features/matching/engine";
import { loadEvidenceBatch, loadOfferTargets } from "@/features/matching/loader";

interface SnapshotRow {
  id: string;
  offer_id: string;
  candidate_id: string;
  match_snapshot: unknown;
}

/**
 * Complète les instantanés de compatibilité manquants (candidatures déposées par
 * les candidats) avec les droits du personnel YEN, et les enregistre si le rôle
 * le permet. Les lignes sont complétées sur place ; au plus 60 par appel.
 */
export async function fillMissingSnapshots(supabase: SupabaseClient, rows: SnapshotRow[], persist: boolean): Promise<void> {
  const missing = rows.filter((r) => !r.match_snapshot).slice(0, 60);
  if (!missing.length) return;
  const targets = await loadOfferTargets(supabase, [...new Set(missing.map((r) => r.offer_id))]);
  const byOffer = new Map(targets.map((t) => [t.id, t]));
  const byDomain = new Map<string | null, string[]>();
  for (const r of missing) {
    const t = byOffer.get(r.offer_id);
    if (!t) continue;
    byDomain.set(t.domainId, [...(byDomain.get(t.domainId) ?? []), r.candidate_id]);
  }
  const evidence = new Map<string, Awaited<ReturnType<typeof loadEvidenceBatch>>>();
  await Promise.all([...byDomain].map(async ([domain, ids]) => evidence.set(domain ?? "", await loadEvidenceBatch(supabase, [...new Set(ids)], domain))));

  const computedAt = new Date().toISOString();
  const updates: PromiseLike<unknown>[] = [];
  for (const r of missing) {
    const t = byOffer.get(r.offer_id);
    const ev = t ? evidence.get(t.domainId ?? "")?.get(r.candidate_id) : undefined;
    if (!t || !ev) continue;
    r.match_snapshot = { ...computeMatch(t, ev), computed_at: computedAt };
    if (persist) updates.push(supabase.from("applications").update({ match_snapshot: r.match_snapshot }).eq("id", r.id).is("match_snapshot", null));
  }
  await Promise.all(updates);
}
