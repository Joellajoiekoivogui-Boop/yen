import type { Metadata } from "next";
import { Download, FileText, History, ScanText, Sparkles, Wand2 } from "lucide-react";
import { ActionButton } from "@/components/forms/action-button";
import { Alert, Badge, ButtonLink, Card, CardBody, CardHeader, PageHeader, Table, TableEmpty, Td, Th } from "@/components/ui";
import { requireCandidate } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime } from "@/lib/utils";
import { getMaxCvBytes } from "@/features/admin/settings";
import { isAIConfigured } from "@/features/ai/provider";
import { applyCvSuggestionAction, improveMyCvAction, runCvExtractionAction } from "@/features/ai/actions";
import type { CvExtraction, CvImprovement } from "@/features/ai/schemas";
import { deleteCvVersionAction, restoreCvVersionAction } from "@/features/cv/actions";
import { CvUploadForm, ExtractionReview } from "./cv-client";

export const metadata: Metadata = { title: "Mon CV" };

const scanBadge: Record<string, { label: string; tone: "green" | "blue" | "amber" | "red" | "neutral" }> = {
  sain: { label: "Antivirus : sain", tone: "green" },
  controle_basique_ok: { label: "Contrôle structurel OK", tone: "blue" },
  non_analyse: { label: "Non analysé", tone: "neutral" },
  suspect: { label: "Suspect", tone: "amber" },
  rejete: { label: "Rejeté", tone: "red" },
};

export default async function CvPage() {
  const ctx = await requireCandidate();
  const supabase = await createClient();
  const [docs, extraction, improvement, consent, maxBytes] = await Promise.all([
    supabase.from("candidate_documents").select("id, original_filename, size_bytes, version, is_current, created_at, deleted_at, scan_status, text_extraction_status, page_count").eq("candidate_id", ctx.candidateId).eq("kind", "cv").order("version", { ascending: false }),
    supabase.from("ai_analyses").select("id, status, output, error, created_at, document_id, validation_status, model").eq("candidate_id", ctx.candidateId).eq("kind", "extraction_cv").order("created_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("ai_analyses").select("id, status, output, error, created_at, model").eq("candidate_id", ctx.candidateId).eq("kind", "amelioration_cv").order("created_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("candidate_consents").select("granted").eq("candidate_id", ctx.candidateId).eq("consent_type", "traitement_ia").maybeSingle(),
    getMaxCvBytes(),
  ]);
  const current = (docs.data ?? []).find((d) => d.is_current && !d.deleted_at);
  const aiReady = isAIConfigured();
  const aiConsent = Boolean(consent.data?.granted);
  const ext = extraction.data;
  const imp = improvement.data;
  const impOut = imp?.status !== "echoue" ? (imp?.output as CvImprovement | null) : null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Mon CV"
        description="Téléversez votre CV en PDF. Il est stocké de façon privée ; les liens de téléchargement sont temporaires."
        actions={<ButtonLink href="/api/candidat/cv-genere" variant="outline" prefetch={false}><Download className="size-4" aria-hidden /> CV généré depuis mon profil</ButtonLink>}
      />

      {!aiReady && <Alert tone="info" title="Fonctions IA indisponibles">Le service d&apos;IA n&apos;est pas configuré sur la plateforme. Le téléversement, le stockage et le CV généré restent disponibles.</Alert>}
      {aiReady && !aiConsent && <Alert tone="warning" title="Analyse IA non autorisée">Pour extraire automatiquement les informations de votre CV, autorisez l&apos;analyse IA dans <a className="underline" href="/candidat/parametres">Paramètres et confidentialité</a>.</Alert>}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader icon={FileText} title="CV actuel" />
          <CardBody className="space-y-4">
            {current ? (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-slate-50 p-3">
                <div className="min-w-0">
                  <p className="truncate font-medium text-navy-900">{current.original_filename}</p>
                  <p className="text-xs text-muted">Version {current.version} · {Math.round(current.size_bytes / 1024)} Ko · {current.page_count ?? "?"} page(s) · {formatDateTime(current.created_at)}</p>
                  <div className="mt-1 flex flex-wrap gap-1">
                    <Badge tone={scanBadge[current.scan_status]?.tone}>{scanBadge[current.scan_status]?.label}</Badge>
                    <Badge tone={current.text_extraction_status === "extrait" ? "gold" : "amber"}>{current.text_extraction_status === "extrait" ? "Texte lisible" : "PDF scanné : OCR nécessaire"}</Badge>
                  </div>
                </div>
                <ButtonLink href={`/api/documents/${current.id}`} variant="outline" size="sm" prefetch={false}><Download className="size-4" aria-hidden /> Télécharger</ButtonLink>
              </div>
            ) : (
              <p className="text-sm text-muted">Aucun CV téléversé.</p>
            )}
            <CvUploadForm maxMb={Math.round(maxBytes / 1024 / 1024)} />
          </CardBody>
        </Card>

        <Card>
          <CardHeader icon={ScanText} title="Extraction des informations" description="L'IA propose ; vous validez chaque élément." action={current && aiReady && aiConsent ? <ActionButton variant="secondary" action={runCvExtractionAction.bind(null, current.id)}><Sparkles className="size-3.5" aria-hidden /> {ext ? "Relancer" : "Lancer"} l&apos;extraction</ActionButton> : undefined} />
          <CardBody>
            {!ext ? (
              <p className="text-sm text-muted">Aucune extraction réalisée.</p>
            ) : ext.status === "echoue" ? (
              <Alert tone="error" title={`Échec de l'extraction du ${formatDateTime(ext.created_at)}`}>{ext.error}</Alert>
            ) : ext.validation_status === "valide" ? (
              <Alert tone="success">Extraction du {formatDateTime(ext.created_at)} validée : les éléments sélectionnés ont été ajoutés à votre profil.</Alert>
            ) : ext.document_id !== current?.id ? (
              <Alert tone="info">La dernière extraction concerne une ancienne version de votre CV. Relancez l&apos;extraction.</Alert>
            ) : (
              <>
                <p className="mb-3 text-xs text-muted">Extraction du {formatDateTime(ext.created_at)} · modèle {ext.model}</p>
                <ExtractionReview analysisId={ext.id} data={ext.output as CvExtraction} />
              </>
            )}
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader icon={Wand2} title="Suggestions pour améliorer mon CV" description="Fondées uniquement sur vos informations réelles : rien n'est inventé." action={aiReady && aiConsent ? <ActionButton variant="secondary" action={improveMyCvAction}><Sparkles className="size-3.5" aria-hidden /> Générer des suggestions</ActionButton> : undefined} />
        <CardBody className="space-y-4">
          {!imp && <p className="text-sm text-muted">Aucune suggestion générée.</p>}
          {imp?.status === "echoue" && <Alert tone="error">{imp.error}</Alert>}
          {impOut && (
            <>
              <p className="text-xs text-muted">Générées le {formatDateTime(imp!.created_at)} · modèle {imp!.model}</p>
              {impOut.improved_headline && (
                <div className="rounded-lg border border-border p-3">
                  <p className="text-xs font-semibold text-muted uppercase">Titre proposé</p>
                  <p className="mt-1 text-sm text-navy-900">{impOut.improved_headline}</p>
                  <div className="mt-2"><ActionButton action={applyCvSuggestionAction.bind(null, { target: "headline", analysisId: imp!.id })}>Appliquer à mon profil</ActionButton></div>
                </div>
              )}
              {impOut.improved_summary && (
                <div className="rounded-lg border border-border p-3">
                  <p className="text-xs font-semibold text-muted uppercase">Résumé proposé</p>
                  <p className="mt-1 text-sm whitespace-pre-line text-navy-900">{impOut.improved_summary}</p>
                  <div className="mt-2"><ActionButton action={applyCvSuggestionAction.bind(null, { target: "summary", analysisId: imp!.id })}>Appliquer à mon profil</ActionButton></div>
                </div>
              )}
              {impOut.improved_experiences.map((e) => (
                <div key={e.experience_id} className="rounded-lg border border-border p-3">
                  <p className="text-xs font-semibold text-muted uppercase">Reformulation d&apos;expérience</p>
                  <p className="mt-1 text-sm whitespace-pre-line text-navy-900">{e.rewritten_description}</p>
                  <div className="mt-2"><ActionButton action={applyCvSuggestionAction.bind(null, { target: "experience", analysisId: imp!.id, experienceId: e.experience_id })}>Appliquer</ActionButton></div>
                </div>
              ))}
              {impOut.suggestions.length > 0 && (
                <ul className="space-y-2">
                  {impOut.suggestions.map((s, i) => (
                    <li key={i} className="rounded-lg bg-slate-50 p-3 text-sm">
                      <span className="font-semibold text-navy-900">{s.section} :</span> <span className="text-slate-600">{s.issue}</span>
                      <p className="mt-1 text-slate-800">→ {s.suggestion}</p>
                    </li>
                  ))}
                </ul>
              )}
              {impOut.missing_information.length > 0 && <Alert tone="info" title="Informations à compléter vous-même">{impOut.missing_information.join(" · ")}</Alert>}
            </>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader icon={History} title="Historique des versions" />
        <CardBody>
          <Table>
            <thead><tr><Th>Version</Th><Th>Fichier</Th><Th>Date</Th><Th>Statut</Th><Th className="text-right">Actions</Th></tr></thead>
            <tbody>
              {(docs.data ?? []).map((d) => (
                <tr key={d.id}>
                  <Td>v{d.version}</Td>
                  <Td className="max-w-[240px] truncate">{d.original_filename}</Td>
                  <Td>{formatDateTime(d.created_at)}</Td>
                  <Td>{d.deleted_at ? <Badge tone="red">Supprimée</Badge> : d.is_current ? <Badge tone="gold">Actuelle</Badge> : <Badge>Archivée</Badge>}</Td>
                  <Td className="text-right">
                    {!d.deleted_at && (
                      <div className="flex justify-end gap-2">
                        <ButtonLink href={`/api/documents/${d.id}`} variant="ghost" size="sm" prefetch={false}>Télécharger</ButtonLink>
                        {!d.is_current && <ActionButton variant="ghost" action={restoreCvVersionAction.bind(null, d.id)}>Rétablir</ActionButton>}
                        <ActionButton variant="ghost" confirm="Supprimer définitivement ce fichier ? L'historique conservera la trace de la version." action={deleteCvVersionAction.bind(null, d.id)}>Supprimer</ActionButton>
                      </div>
                    )}
                  </Td>
                </tr>
              ))}
              {(docs.data ?? []).length === 0 && <TableEmpty colSpan={5}>Aucune version.</TableEmpty>}
            </tbody>
          </Table>
        </CardBody>
      </Card>
    </div>
  );
}
