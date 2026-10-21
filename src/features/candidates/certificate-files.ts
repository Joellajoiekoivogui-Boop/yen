"use server";

import { revalidatePath } from "next/cache";
import { getMaxCvBytes } from "@/features/admin/settings";
import { sanitizeFilename } from "@/features/cv/pdf-validation";
import { scanFile } from "@/features/cv/scanner";
import { checkCertificateFile, FILE_TYPES } from "@/features/documents/file-validation";
import { inspectPdf } from "@/features/documents/inspect-pdf";
import { DOCUMENTS_BUCKET as BUCKET, isTemporaryUploadPath, storeValidatedFile, takeTemporaryUpload } from "@/features/documents/uploads";
import { dbErrorMessage, fail, logAudit, parseInput, runAction, type ActionResult } from "@/lib/action";
import { createClient } from "@/lib/supabase/server";
import { isUuid } from "@/lib/utils";
import { refreshPipelineStatus } from "./pipeline";
import { certificationSchema } from "./schemas";

/**
 * Enregistre un certificat en une seule fois : formation suivie, organisme, période et
 * justificatif (PDF ou image déposé directement dans le stockage, voir documents/upload-client.ts).
 * Le fichier est vérifié AVANT toute écriture (type réel, contenu actif, antivirus si configuré) :
 * un certificat n'est jamais créé sans son justificatif. Une modification annule la
 * vérification éventuelle de YEN (trigger protect_certification_verification).
 */
export async function saveCertificateAction(values: Record<string, unknown>): Promise<ActionResult> {
  return runAction({ requireCandidate: true }, async (ctx) => {
    const data = parseInput(certificationSchema, values);
    const id = isUuid(values.id) ? (values.id as string) : null;
    const uploadPath = values.upload_path;
    if (!id && !uploadPath) return fail("Ajoutez votre certificat (PDF ou photo).", { upload_path: ["Ajoutez votre certificat (PDF ou photo)."] });
    if (uploadPath && !isTemporaryUploadPath(ctx.userId, uploadPath)) return fail("Envoi introuvable. Choisissez de nouveau le fichier.");
    const supabase = await createClient();

    if (id) {
      const { data: own } = await supabase.from("candidate_certifications").select("id").eq("id", id).eq("candidate_id", ctx.candidateId!).maybeSingle();
      if (!own) return fail("Certificat introuvable.");
    }

    // 1. Justificatif vérifié puis stocké définitivement, avant toute écriture en base
    let file: { path: string; filename: string; mime: string; size: number; sha256: string; scanStatus: string; scanDetails: string } | null = null;
    if (typeof uploadPath === "string") {
      const maxBytes = await getMaxCvBytes();
      const taken = await takeTemporaryUpload(supabase, uploadPath, maxBytes);
      if (!taken.ok) return fail(taken.reason);
      const check = checkCertificateFile(taken.bytes, maxBytes);
      if (!check.ok || !check.type) {
        await logAudit(ctx.userId, "certificate_file_rejected", "candidate_certifications", id, { reason: check.reason });
        return fail(check.reason ?? "Fichier refusé.");
      }
      if (check.type === "pdf") {
        const pdf = await inspectPdf(taken.bytes);
        if (!pdf.ok) return fail(pdf.reason);
      }
      let scan;
      try {
        scan = await scanFile(taken.bytes, String(values.filename ?? "certificat"));
      } catch {
        return fail("Le service d'analyse antivirus est momentanément indisponible. Réessayez plus tard.");
      }
      if (scan.status === "rejete") {
        await logAudit(ctx.userId, "certificate_file_rejected", "candidate_certifications", id, { reason: scan.details });
        return fail("Le fichier a été rejeté par l'analyse de sécurité.");
      }
      const path = await storeValidatedFile(supabase, ctx.userId, taken.bytes, check.type);
      if (!path) return fail("Le fichier n'a pas pu être stocké : votre espace est peut-être plein (40 fichiers). Supprimez d'anciens documents puis réessayez.");
      const { mime, ext } = FILE_TYPES[check.type];
      file = { path, filename: sanitizeFilename(String(values.filename ?? "certificat"), ext), mime, size: taken.bytes.byteLength, sha256: check.sha256, scanStatus: scan.status, scanDetails: scan.details };
    }

    // 2. Certificat (création ou modification)
    const saved = id
      ? await supabase.from("candidate_certifications").update(data).eq("id", id).eq("candidate_id", ctx.candidateId!).select("id").single()
      : await supabase.from("candidate_certifications").insert({ ...data, candidate_id: ctx.candidateId }).select("id").single();
    if (saved.error || !saved.data) {
      if (file) await supabase.storage.from(BUCKET).remove([file.path]);
      return fail(dbErrorMessage(saved.error, "Le certificat n'a pas pu être enregistré."));
    }
    const certificationId = saved.data.id as string;

    // 3. Rattachement du justificatif ; l'ancien est retiré (une seule transaction en base)
    if (file) {
      const att = await supabase.rpc("attach_certificate_document", {
        p_certification: certificationId,
        p_storage_path: file.path,
        p_filename: file.filename,
        p_mime: file.mime,
        p_size: file.size,
        p_sha256: file.sha256,
        p_scan_status: file.scanStatus,
        p_scan_details: file.scanDetails,
      });
      if (att.error || !att.data) {
        await supabase.storage.from(BUCKET).remove([file.path]);
        // jamais de certificat sans justificatif
        if (!id) await supabase.from("candidate_certifications").delete().eq("id", certificationId).eq("candidate_id", ctx.candidateId!);
        return fail(dbErrorMessage(att.error, "Le justificatif n'a pas pu être enregistré."));
      }
      const oldPath = (att.data as { old_storage_path: string | null }).old_storage_path;
      if (oldPath) {
        const rm = await supabase.storage.from(BUCKET).remove([oldPath]);
        if (rm.error) console.error("[certificats] ancien fichier conservé", rm.error.message);
      }
    }

    await supabase.from("candidate_profiles").update({ last_activity_at: new Date().toISOString() }).eq("id", ctx.candidateId!);
    await refreshPipelineStatus(ctx.candidateId!);
    revalidatePath("/candidat", "layout");
    return { ok: true, message: id ? "Certificat mis à jour." : "Certificat ajouté." };
  });
}

/** Supprime un certificat et efface son justificatif (métadonnées conservées pour l'historique). */
export async function deleteCertificateAction(certificationId: string): Promise<ActionResult> {
  return runAction({ requireCandidate: true }, async (ctx) => {
    if (!isUuid(certificationId)) return fail("Certificat introuvable.");
    const supabase = await createClient();
    const { data: cert } = await supabase
      .from("candidate_certifications")
      .select("id, document_id")
      .eq("id", certificationId)
      .eq("candidate_id", ctx.candidateId!)
      .maybeSingle();
    if (!cert) return fail("Certificat introuvable.");
    const del = await supabase.from("candidate_certifications").delete().eq("id", cert.id).eq("candidate_id", ctx.candidateId!);
    if (del.error) return fail(dbErrorMessage(del.error));
    if (cert.document_id) await retireDocument(cert.document_id);
    await refreshPipelineStatus(ctx.candidateId!);
    revalidatePath("/candidat", "layout");
    return { ok: true, message: "Certificat supprimé." };
  });
}

/** Efface le fichier d'un ancien justificatif et le marque supprimé (métadonnées conservées pour l'historique). */
async function retireDocument(documentId: string) {
  try {
    const supabase = await createClient();
    const { data: path, error } = await supabase.rpc("retire_candidate_document", { p_document: documentId });
    if (error) throw error;
    if (path) await supabase.storage.from(BUCKET).remove([path as string]);
  } catch (e) {
    console.error("[certificats] ancien justificatif conservé", e instanceof Error ? e.message : e);
  }
}
