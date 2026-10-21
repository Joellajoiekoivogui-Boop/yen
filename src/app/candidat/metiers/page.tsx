import type { Metadata } from "next";
import { Brain, Sparkles } from "lucide-react";
import { ProfileAnalysisView, type AnalysisRow } from "@/components/ai-analysis-view";
import { ActionButton } from "@/components/forms/action-button";
import { MatchDetails } from "@/components/match-details";
import { Alert, Card, CardBody, CardHeader, EmptyState, PageHeader } from "@/components/ui";
import { requireCandidate } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { analyzeMyProfileAction } from "@/features/ai/actions";
import { isAIConfigured } from "@/features/ai/provider";
import { computeMatch, rankMatches } from "@/features/matching/engine";
import { loadEvidence, loadOccupationTargets } from "@/features/matching/loader";
import { param } from "@/lib/utils";

export const metadata: Metadata = { title: "Métiers recommandés" };

export default async function OccupationsPage(props: PageProps<"/candidat/metiers">) {
  const sp = await props.searchParams;
  const ctx = await requireCandidate();
  const supabase = await createClient();
  const { data: cand } = await supabase.from("candidate_profiles").select("primary_domain_id").eq("id", ctx.candidateId).single();
  const allDomains = param(sp.tous) === "1" || !cand?.primary_domain_id;
  const [evidence, targets, analysis, consent] = await Promise.all([
    loadEvidence(supabase, ctx.candidateId, cand?.primary_domain_id ?? null),
    loadOccupationTargets(supabase, allDomains ? {} : { domainIds: [cand!.primary_domain_id!] }),
    supabase.from("ai_analyses").select("id, kind, status, output, error, created_at, model, provider, prompt_version, validation_status, correction_note, input_refs").eq("candidate_id", ctx.candidateId).eq("kind", "analyse_profil").neq("validation_status", "rejete").order("created_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("candidate_consents").select("granted").eq("candidate_id", ctx.candidateId).eq("consent_type", "traitement_ia").maybeSingle(),
  ]);
  const ranked = evidence ? rankMatches(targets.map((t) => ({ target: t, match: computeMatch(t, evidence) }))).slice(0, 8) : [];
  const aiReady = isAIConfigured();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Métiers recommandés"
        description="Compatibilité calculée selon des critères explicites et pondérés par YEN. Elle progresse à mesure que vous démontrez vos compétences."
        actions={<a href={allDomains ? "/candidat/metiers" : "/candidat/metiers?tous=1"} className="text-sm text-electric-700 hover:underline">{allDomains ? "Mon domaine principal" : "Tous les domaines"}</a>}
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {ranked.length === 0 && <div className="lg:col-span-2"><EmptyState title="Aucun métier à afficher" description="Renseignez votre domaine principal dans votre profil." /></div>}
        {ranked.map(({ target, match }) => (
          <Card key={target.id}>
            <CardHeader title={target.title} />
            <CardBody><MatchDetails match={match} compact /></CardBody>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader
          icon={Brain}
          title="Analyse IA de mon profil"
          description="Synthèse traçable : chaque conclusion cite ses sources. Si les preuves sont insuffisantes, l'analyse l'indique."
          action={aiReady && consent.data?.granted ? <ActionButton variant="secondary" action={analyzeMyProfileAction}><Sparkles className="size-3.5" aria-hidden /> Analyser mon profil</ActionButton> : undefined}
        />
        <CardBody>
          {!aiReady && <Alert tone="info">Le service d&apos;IA n&apos;est pas configuré sur la plateforme : les recommandations ci-dessus restent calculées de façon déterministe.</Alert>}
          {aiReady && !consent.data?.granted && <Alert tone="warning">Autorisez l&apos;analyse IA dans <a className="underline" href="/candidat/parametres">Paramètres et confidentialité</a> pour obtenir une analyse détaillée.</Alert>}
          {analysis.data ? <div className="mt-3"><ProfileAnalysisView row={analysis.data as AnalysisRow} /></div> : aiReady && <p className="mt-3 text-sm text-muted">Aucune analyse réalisée pour l&apos;instant.</p>}
        </CardBody>
      </Card>
    </div>
  );
}
