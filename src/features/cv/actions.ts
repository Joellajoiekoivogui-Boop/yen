"use server";

import { revalidatePath } from "next/cache";
import { getMaxCvBytes } from "@/features/admin/settings";
import { inspectPdf } from "@/features/documents/inspect-pdf";
import { DOCUMENTS_BUCKET as CV_BUCKET, isTemporaryUploadPath, storeValidatedFile, takeTemporaryUpload } from "@/features/documents/uploads";
import { dbErrorMessage, fail, logAudit, runAction, type ActionResult } from "@/lib/action";
import { createClient } from "@/lib/supabase/server";
import { isUuid } from "@/lib/utils";
import { refreshPipelineStatus } from "@/features/candidates/pipeline";
import { checkPdf, sanitizeFilename } from "./pdf-validation";
import { scanFile } from "./scanner";

/**
 * Enregistrement d'un CV PDF déposé directement dans le stockage (voir documents/upload-client.ts) :
 *  1. récupération du fichier temporaire, contrôle de la taille (paramètre plateforme) et du type RÉEL ;
 *  2. rejet des PDF à contenu actif ou exigeant un mot de passe ; antivirus si configuré ;
 *  3. version définitive stockée par le serveur sous <user_id>/<uuid>.pdf ;
 *  4. nouvelle version courante, l'ancienne est conservée dans l'historique ;
 *  5. extraction du texte (les PDF scannés sont signalés pour OCR).
 */
export async function uploadCvAction(input: { path: string; filename: string }): Promise<ActionResult> {
  return runAction({ requireCandidate: true }, async (ctx) => {
    if (!isTemporaryUploadPath(ctx.userId, input?.path) || !input.path.endsWith(".pdf")) return fail("Envoi introuvable. Recommencez le téléversement.");
    const filename = String(input.filename ?? "cv.pdf");
    const maxBytes = await getMaxCvBytes();
    const supabase = await createClient();

    const taken = await takeTemporaryUpload(supabase, input.path, maxBytes);
    if (!taken.ok) return fail(taken.reason);
    const bytes = taken.bytes;

    const check = checkPdf(bytes, maxBytes);
    if (!check.ok) {
      await logAudit(ctx.userId, "cv_rejected", "candidate_documents", null, { reason: check.reason, markers: check.suspiciousMarkers });
      return fail(check.reason ?? "Fichier refusé.");
    }
    // Ouverture réelle du PDF : pages et texte
    const pdf = await inspectPdf(bytes);
    if (!pdf.ok) {
      await logAudit(ctx.userId, "cv_rejected", "candidate_documents", null, { reason: pdf.reason });
      return fail(pdf.reason);
    }

    let scan;
    try {
      scan = await scanFile(bytes, filename);
    } catch {
      return fail("Le service d'analyse antivirus est momentanément indisponible. Réessayez plus tard.");
    }
    if (scan.status === "rejete") {
      await logAudit(ctx.userId, "cv_rejected", "candidate_documents", null, { reason: scan.details });
      return fail("Le fichier a été rejeté par l'analyse de sécurité.");
    }

    const path = await storeValidatedFile(supabase, ctx.userId, bytes, "pdf");
    if (!path) return fail("Le fichier n'a pas pu être stocké : votre espace est peut-être plein (40 fichiers). Supprimez d'anciennes versions puis réessayez.");

    const text = pdf.text;
    const extractionStatus = text.length >= 150 ? "extrait" : "ocr_requis";

    // Nouvelle version courante (numéro et bascule calculés en base, en une transaction)
    const reg = await supabase.rpc("register_cv_document", {
      p_storage_path: path,
      p_filename: sanitizeFilename(filename),
      p_size: bytes.byteLength,
      p_sha256: check.sha256,
      p_scan_status: scan.status,
      p_scan_details: scan.details,
      p_page_count: pdf.pageCount,
      p_text_status: extractionStatus,
      p_text: extractionStatus === "extrait" ? text.slice(0, 200_000) : null,
    });
    if (reg.error) {
      await supabase.storage.from(CV_BUCKET).remove([path]);
      return fail(dbErrorMessage(reg.error, "Le document n'a pas pu être enregistré."));
    }

    await refreshPipelineStatus(ctx.candidateId!);
    revalidatePath("/candidat", "layout");
    return {
      ok: true,
      message: extractionStatus === "extrait"
        ? "CV téléversé et texte extrait. Vous pouvez lancer l'extraction des informations."
        : "CV téléversé. Aucun texte lisible : il s'agit probablement d'un PDF scanné, une lecture par OCR (IA) sera nécessaire.",
    };
  });
}

/** Suppression contrôlée d'une version : fichier effacé, métadonnées conservées pour l'historique. */
export async function deleteCvVersionAction(documentId: string): Promise<ActionResult> {
  return runAction({ requireCandidate: true }, async (ctx) => {
    if (!isUuid(documentId)) return fail("Identifiant invalide.");
    const supabase = await createClient();
    const { data: path, error } = await supabase.rpc("retire_candidate_document", { p_document: documentId });
    if (error || !path) return fail(dbErrorMessage(error, "Document introuvable."));
    const rm = await supabase.storage.from(CV_BUCKET).remove([path as string]);
    if (rm.error) console.error("[cv] fichier non effacé du stockage", rm.error.message);
    await refreshPipelineStatus(ctx.candidateId!);
    revalidatePath("/candidat", "layout");
    return { ok: true, message: "Version supprimée." };
  });
}

/** Rétablit une version précédente comme CV courant. */
export async function restoreCvVersionAction(documentId: string): Promise<ActionResult> {
  return runAction({ requireCandidate: true }, async () => {
    if (!isUuid(documentId)) return fail("Identifiant invalide.");
    const supabase = await createClient();
    const { error } = await supabase.rpc("set_current_cv", { p_document: documentId });
    if (error) return fail(dbErrorMessage(error, "Document introuvable."));
    revalidatePath("/candidat/cv");
    return { ok: true, message: "Version rétablie comme CV actuel." };
  });
}
