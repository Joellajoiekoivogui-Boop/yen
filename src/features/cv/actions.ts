"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { extractText, getDocumentProxy } from "unpdf";
import { getMaxCvBytes } from "@/features/admin/settings";
import { dbErrorMessage, fail, logAudit, rateLimit, runAction, type ActionResult } from "@/lib/action";
import { createClient } from "@/lib/supabase/server";
import { isUuid } from "@/lib/utils";
import { refreshPipelineStatus } from "@/features/candidates/pipeline";
import { checkPdf, sanitizeFilename } from "./pdf-validation";
import { scanFile } from "./scanner";

const CV_BUCKET = "candidate-documents";

/**
 * Téléversement d'un CV PDF :
 *  1. contrôle de la taille (paramètre plateforme) et du type RÉEL (signature) ;
 *  2. rejet des PDF à contenu actif ; antivirus si configuré ;
 *  3. stockage privé sous <user_id>/<uuid>.pdf (politique de stockage RLS) ;
 *  4. nouvelle version courante, l'ancienne est conservée dans l'historique ;
 *  5. extraction du texte (les PDF scannés sont signalés pour OCR).
 */
export async function uploadCvAction(formData: FormData): Promise<ActionResult> {
  return runAction({ requireCandidate: true }, async (ctx) => {
    if (!(await rateLimit(`cv-upload:${ctx.userId}`))) return fail("Trop de téléversements récents. Réessayez dans une heure.");
    const file = formData.get("file");
    if (!(file instanceof File)) return fail("Aucun fichier reçu.");
    const maxBytes = await getMaxCvBytes();
    if (file.size > maxBytes) return fail(`Le fichier dépasse la taille maximale autorisée (${Math.round(maxBytes / 1024 / 1024)} Mo).`);

    const bytes = new Uint8Array(await file.arrayBuffer());
    const check = checkPdf(bytes, maxBytes);
    if (!check.ok) {
      await logAudit(ctx.userId, "cv_rejected", "candidate_documents", null, { reason: check.reason, markers: check.suspiciousMarkers });
      return fail(check.reason ?? "Fichier refusé.");
    }

    let scan;
    try {
      scan = await scanFile(bytes, file.name);
    } catch {
      return fail("Le service d'analyse antivirus est momentanément indisponible. Réessayez plus tard.");
    }
    if (scan.status === "rejete") {
      await logAudit(ctx.userId, "cv_rejected", "candidate_documents", null, { reason: scan.details });
      return fail("Le fichier a été rejeté par l'analyse de sécurité.");
    }

    const supabase = await createClient();
    const path = `${ctx.userId}/${randomUUID()}.pdf`;
    const up = await supabase.storage.from(CV_BUCKET).upload(path, bytes, { contentType: "application/pdf", upsert: false, cacheControl: "0" });
    if (up.error) return fail("Le fichier n'a pas pu être stocké. Réessayez.");

    // Lecture des pages et du texte
    let pageCount: number | null = null;
    let text = "";
    try {
      const pdf = await getDocumentProxy(new Uint8Array(bytes));
      pageCount = pdf.numPages;
      const res = await extractText(pdf, { mergePages: true });
      text = (Array.isArray(res.text) ? res.text.join("\n") : res.text).replace(/\u0000/g, "").trim();
    } catch {
      text = "";
    }
    const extractionStatus = text.length >= 150 ? "extrait" : "ocr_requis";

    // Nouvelle version courante (numéro et bascule calculés en base, en une transaction)
    const reg = await supabase.rpc("register_cv_document", {
      p_storage_path: path,
      p_filename: sanitizeFilename(file.name),
      p_size: bytes.byteLength,
      p_sha256: check.sha256,
      p_scan_status: scan.status,
      p_scan_details: scan.details,
      p_page_count: pageCount,
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
