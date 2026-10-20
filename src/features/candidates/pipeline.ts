import "server-only";
import { createClient } from "@/lib/supabase/server";

/**
 * Transitions automatiques limitées aux deux premières étapes du pipeline :
 *  - profil complété à 70 % ou plus → « En cours d'évaluation » ;
 *  - sinon → « Profil incomplet ».
 * La complétion est recalculée en base (refresh_auto_pipeline, mêmes règles que
 * completion.ts) : aucune valeur n'est fournie par le navigateur. Les étapes
 * suivantes sont des décisions humaines prises par l'équipe YEN.
 */
export async function refreshPipelineStatus(candidateId: string): Promise<void> {
  try {
    const supabase = await createClient();
    const { error } = await supabase.rpc("refresh_auto_pipeline", { p_candidate: candidateId });
    if (error) throw error;
  } catch (e) {
    console.error("[pipeline] mise à jour impossible", e instanceof Error ? e.message : e);
  }
}
