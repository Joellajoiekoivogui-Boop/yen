import "server-only";
import { createClient } from "@/lib/supabase/server";
import { completionOf, loadCandidateBundle } from "./queries";

const AUTO_STATUSES = new Set(["profil_incomplet", "en_evaluation"]);

/**
 * Transitions automatiques limitées aux deux premières étapes du pipeline :
 *  - profil complété à 70 % ou plus → « En cours d'évaluation » ;
 *  - sinon → « Profil incomplet ».
 * Toutes les étapes suivantes (prêt pour la présélection, présélectionné, …)
 * sont des décisions humaines prises par l'équipe YEN. La fonction SQL
 * set_auto_pipeline_status n'autorise que ces deux étapes.
 */
export async function refreshPipelineStatus(candidateId: string): Promise<void> {
  try {
    const supabase = await createClient();
    const bundle = await loadCandidateBundle(supabase, candidateId);
    if (!bundle || !AUTO_STATUSES.has(bundle.candidate.pipeline_status)) return;
    const { percent } = completionOf(bundle);
    const next = percent >= 70 ? "en_evaluation" : "profil_incomplet";
    if (next !== bundle.candidate.pipeline_status) {
      const { error } = await supabase.rpc("set_auto_pipeline_status", { p_candidate: candidateId, p_status: next });
      if (error) throw error;
    }
  } catch (e) {
    console.error("[pipeline] mise à jour impossible", e instanceof Error ? e.message : e);
  }
}
