"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { getMaxCvBytes } from "@/features/admin/settings";
import { sanitizeFilename } from "@/features/cv/pdf-validation";
import { scanFile } from "@/features/cv/scanner";
import { checkCertificateFile, FILE_TYPES } from "@/features/documents/file-validation";
import { dbErrorMessage, fail, logAudit, rateLimit, runAction, type ActionResult } from "@/lib/action";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { isUuid } from "@/lib/utils";

const BUCKET = "candidate-documents";

/**
 * Joint un justificatif (PDF, JPEG, PNG ou WebP) à une certification du candidat :
 * type réel contrôlé, antivirus si configuré, stockage privé sous <user_id>/<uuid>.<ext>.
 * Tout se fait avec les droits du candidat (RLS) ; une nouvelle pièce annule la
 * vérification éventuelle de YEN (trigger protect_certification_verification).
 */
export async function uploadCertificateFileAction(formData: FormData): Promise<ActionResult> {
  return runAction({ requireCandidate: true }, async (ctx) => {
    const certificationId = String(formData.get("certificationId") ?? "");
    if (!isUuid(certificationId)) return fail("Certification introuvable.");
    if (!(await rateLimit(`certificate-upload:${ctx.userId}`, 20, 3600))) return fail("Trop de téléversements récents. Réessayez dans une heure.");
    const file = formData.get("file");
    if (!(file instanceof File)) return fail("Aucun fichier reçu.");
    const maxBytes = await getMaxCvBytes();
    if (file.size > maxBytes) return fail(`Le fichier dépasse la taille maximale autorisée (${Math.round(maxBytes / 1024 / 1024)} Mo).`);

    const supabase = await createClient();
    const { data: cert } = await supabase
      .from("candidate_certifications")
      .select("id, document_id")
      .eq("id", certificationId)
      .eq("candidate_id", ctx.candidateId!)
      .maybeSingle();
    if (!cert) return fail("Certification introuvable.");

    const bytes = new Uint8Array(await file.arrayBuffer());
    const check = checkCertificateFile(bytes, maxBytes);
    if (!check.ok || !check.type) {
      await logAudit(ctx.userId, "certificate_file_rejected", "candidate_certifications", cert.id, { reason: check.reason });
      return fail(check.reason ?? "Fichier refusé.");
    }

    let scan;
    try {
      scan = await scanFile(bytes, file.name);
    } catch {
      return fail("Le service d'analyse antivirus est momentanément indisponible. Réessayez plus tard.");
    }
    if (scan.status === "rejete") {
      await logAudit(ctx.userId, "certificate_file_rejected", "candidate_certifications", cert.id, { reason: scan.details });
      return fail("Le fichier a été rejeté par l'analyse de sécurité.");
    }

    const { mime, ext } = FILE_TYPES[check.type];
    const path = `${ctx.userId}/${randomUUID()}.${ext}`;
    const up = await supabase.storage.from(BUCKET).upload(path, bytes, { contentType: mime, upsert: false, cacheControl: "0" });
    if (up.error) return fail("Le fichier n'a pas pu être stocké. Réessayez.");

    const ins = await supabase
      .from("candidate_documents")
      .insert({
        candidate_id: ctx.candidateId,
        kind: "certification",
        storage_path: path,
        original_filename: sanitizeFilename(file.name, ext),
        mime_type: mime,
        size_bytes: bytes.byteLength,
        sha256: check.sha256,
        version: 1,
        is_current: true,
        scan_status: scan.status,
        scan_details: scan.details,
        uploaded_by: ctx.userId,
      })
      .select("id")
      .single();
    if (ins.error || !ins.data) {
      await supabase.storage.from(BUCKET).remove([path]);
      return fail(dbErrorMessage(ins.error, "Le justificatif n'a pas pu être enregistré."));
    }

    const upd = await supabase.from("candidate_certifications").update({ document_id: ins.data.id }).eq("id", cert.id);
    if (upd.error) return fail(dbErrorMessage(upd.error, "Le justificatif n'a pas pu être associé à la certification."));

    if (cert.document_id) await retireDocument(cert.document_id);
    revalidatePath("/candidat/certifications");
    return { ok: true, message: "Justificatif ajouté à la certification." };
  });
}

/** Retire le justificatif d'une certification. */
export async function removeCertificateFileAction(certificationId: string): Promise<ActionResult> {
  return runAction({ requireCandidate: true }, async (ctx) => {
    if (!isUuid(certificationId)) return fail("Certification introuvable.");
    const supabase = await createClient();
    const { data: cert } = await supabase
      .from("candidate_certifications")
      .select("id, document_id")
      .eq("id", certificationId)
      .eq("candidate_id", ctx.candidateId!)
      .maybeSingle();
    if (!cert?.document_id) return fail("Aucun justificatif à retirer.");
    const upd = await supabase.from("candidate_certifications").update({ document_id: null }).eq("id", cert.id);
    if (upd.error) return fail(dbErrorMessage(upd.error));
    await retireDocument(cert.document_id);
    revalidatePath("/candidat/certifications");
    return { ok: true, message: "Justificatif retiré." };
  });
}

/**
 * Efface le fichier d'un ancien justificatif et le marque supprimé (métadonnées
 * conservées pour l'historique). Nécessite la clé de service ; sans elle, l'ancien
 * fichier reste simplement stocké de façon privée.
 */
async function retireDocument(documentId: string) {
  try {
    const admin = createAdminClient();
    const { data: doc } = await admin.from("candidate_documents").select("id, storage_path").eq("id", documentId).maybeSingle();
    if (!doc) return;
    await admin.storage.from(BUCKET).remove([doc.storage_path]);
    await admin.from("candidate_documents").update({ deleted_at: new Date().toISOString(), is_current: false }).eq("id", doc.id);
  } catch (e) {
    console.error("[certificats] ancien justificatif conservé", e instanceof Error ? e.message : e);
  }
}
