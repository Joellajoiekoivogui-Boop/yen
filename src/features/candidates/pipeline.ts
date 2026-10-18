import "server-only";
import { createAdminClient } from "@/lib/supabase/server";
import { completionOf, loadCandidateBundle } from "./queries";

const AUTO_STATUSES = new Set(["profil_incomplet", "en_evaluation"]);

/**
 * Transitions automatiques limitées aux deux premières étapes du pipeline :
 *  - profil complété à 70 % ou plus → « En cours d'évaluation » ;
 *  - sinon → « Profil incomplet ».
 * Toutes les étapes suivantes (prêt pour la présélection, présélectionné, …)
 * sont des décisions humaines prises par l'équipe YEN.
 */
export async function refreshPipelineStatus(candidateId: string): Promise<void> {
  try {
    const admin = createAdminClient();
    const bundle = await loadCandidateBundle(admin, candidateId);
    if (!bundle || !AUTO_STATUSES.has(bundle.candidate.pipeline_status)) return;
    const { percent } = completionOf(bundle);
    const next = percent >= 70 ? "en_evaluation" : "profil_incomplet";
    if (next !== bundle.candidate.pipeline_status) {
      await admin.from("candidate_profiles").update({ pipeline_status: next }).eq("id", candidateId);
    }
  } catch (e) {
    console.error("[pipeline] mise à jour impossible", e instanceof Error ? e.message : e);
  }
}
