"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { extractText, getDocumentProxy } from "unpdf";
import { getMaxCvBytes } from "@/features/admin/settings";
import { dbErrorMessage, fail, logAudit, rateLimit, runAction, type ActionResult } from "@/lib/action";
import { createAdminClient, createClient } from "@/lib/supabase/server";
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
    if (!(await rateLimit(`cv-upload:${ctx.userId}`, 10, 3600))) return fail("Trop de téléversements récents. Réessayez dans une heure.");
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
    const admin = createAdminClient();
    const path = `${ctx.userId}/${randomUUID()}.pdf`;
    const up = await supabase.storage.from(CV_BUCKET).upload(path, bytes, { contentType: "application/pdf", upsert: false, cacheControl: "0" });
    if (up.error) return fail("Le fichier n'a pas pu être stocké. Réessayez.");

    const { data: previous } = await admin
      .from("candidate_documents")
      .select("id, version")
      .eq("candidate_id", ctx.candidateId!)
      .eq("kind", "cv")
      .order("version", { ascending: false })
      .limit(1);
    const prevCurrent = await admin.from("candidate_documents").select("id").eq("candidate_id", ctx.candidateId!).eq("kind", "cv").eq("is_current", true).is("deleted_at", null);
    const prevIds = (prevCurrent.data ?? []).map((d) => d.id);
    if (prevIds.length) await admin.from("candidate_documents").update({ is_current: false }).in("id", prevIds);

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

    const ins = await supabase
      .from("candidate_documents")
      .insert({
        candidate_id: ctx.candidateId,
        kind: "cv",
        storage_path: path,
        original_filename: sanitizeFilename(file.name),
        mime_type: "application/pdf",
        size_bytes: bytes.byteLength,
        sha256: check.sha256,
        version: (previous?.[0]?.version ?? 0) + 1,
        is_current: true,
        scan_status: scan.status,
        scan_details: scan.details,
        page_count: pageCount,
        text_extraction_status: extractionStatus,
        uploaded_by: ctx.userId,
      })
      .select("id")
      .single();

    if (ins.error || !ins.data) {
      // Annulation : restaure la version précédente et supprime le fichier
      if (prevIds.length) await admin.from("candidate_documents").update({ is_current: true }).in("id", prevIds);
      await supabase.storage.from(CV_BUCKET).remove([path]);
      return fail(dbErrorMessage(ins.error, "Le document n'a pas pu être enregistré."));
    }

    if (extractionStatus === "extrait") {
      await admin.from("candidate_document_texts").insert({ document_id: ins.data.id, candidate_id: ctx.candidateId, method: "pdf_text", content: text.slice(0, 200_000) });
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
    const { data: doc } = await supabase
      .from("candidate_documents")
      .select("id, storage_path, is_current, candidate_id")
      .eq("id", documentId)
      .eq("candidate_id", ctx.candidateId!)
      .is("deleted_at", null)
      .maybeSingle();
    if (!doc) return fail("Document introuvable.");
    const rm = await supabase.storage.from(CV_BUCKET).remove([doc.storage_path]);
    if (rm.error) return fail("Le fichier n'a pas pu être supprimé.");
    const admin = createAdminClient();
    const upd = await admin.from("candidate_documents").update({ deleted_at: new Date().toISOString(), is_current: false }).eq("id", doc.id);
    if (upd.error) return fail(dbErrorMessage(upd.error));
    await admin.from("candidate_document_texts").delete().eq("document_id", doc.id);
    await refreshPipelineStatus(ctx.candidateId!);
    revalidatePath("/candidat", "layout");
    return { ok: true, message: "Version supprimée." };
  });
}

/** Rétablit une version précédente comme CV courant. */
export async function restoreCvVersionAction(documentId: string): Promise<ActionResult> {
  return runAction({ requireCandidate: true }, async (ctx) => {
    if (!isUuid(documentId)) return fail("Identifiant invalide.");
    const supabase = await createClient();
    const { data: doc } = await supabase.from("candidate_documents").select("id").eq("id", documentId).eq("candidate_id", ctx.candidateId!).eq("kind", "cv").is("deleted_at", null).maybeSingle();
    if (!doc) return fail("Document introuvable.");
    const admin = createAdminClient();
    await admin.from("candidate_documents").update({ is_current: false }).eq("candidate_id", ctx.candidateId!).eq("kind", "cv").eq("is_current", true);
    const { error } = await admin.from("candidate_documents").update({ is_current: true }).eq("id", doc.id);
    if (error) return fail(dbErrorMessage(error));
    revalidatePath("/candidat/cv");
    return { ok: true, message: "Version rétablie comme CV actuel." };
  });
}
