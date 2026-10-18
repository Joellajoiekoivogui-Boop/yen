import type { Metadata } from "next";
import { Alert, PageHeader } from "@/components/ui";
import { requireCandidate } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { isAIConfigured } from "@/features/ai/provider";
import { AssistantChat } from "./chat";

export const metadata: Metadata = { title: "Assistant IA" };

export default async function AssistantPage() {
  const ctx = await requireCandidate();
  const supabase = await createClient();
  const { data: consent } = await supabase.from("candidate_consents").select("granted").eq("candidate_id", ctx.candidateId).eq("consent_type", "traitement_ia").maybeSingle();
  return (
    <div className="space-y-4">
      <PageHeader title="Assistant IA" description="Explications de résultats, amélioration du CV, préparation d'entretien, plan d'apprentissage. L'assistant n'utilise que votre propre profil et n'invente aucune expérience." />
      {!isAIConfigured() ? (
        <Alert tone="info" title="Assistant indisponible">Le service d&apos;IA n&apos;est pas configuré sur la plateforme.</Alert>
      ) : !consent?.granted ? (
        <Alert tone="warning">Autorisez l&apos;analyse IA dans <a className="underline" href="/candidat/parametres">Paramètres et confidentialité</a> pour utiliser l&apos;assistant.</Alert>
      ) : (
        <>
          <AssistantChat />
          <p className="text-xs text-muted">Les conversations ne sont pas enregistrées. Les réponses de l&apos;IA peuvent contenir des erreurs : vérifiez les informations importantes.</p>
        </>
      )}
    </div>
  );
}
