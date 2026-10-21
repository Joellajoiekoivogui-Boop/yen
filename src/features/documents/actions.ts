"use server";

import { getMaxCvBytes } from "@/features/admin/settings";
import { fail, rateLimit, runAction, type ActionResult } from "@/lib/action";
import { createClient } from "@/lib/supabase/server";
import { FILE_TYPES } from "./file-validation";
import { cleanupStaleUploads, declaredFileType, DOCUMENTS_BUCKET, temporaryUploadPath } from "./uploads";

export type UploadPurpose = "cv" | "certificate";
export interface PreparedUpload {
  path: string;
  signedUrl: string;
  contentType: string;
}

/**
 * Prépare l'envoi direct d'un fichier vers le stockage privé : contrôles préalables
 * (type annoncé, taille, fréquence) puis URL signée à usage unique vers un emplacement
 * temporaire du dossier du candidat. Le contenu réel est vérifié à l'enregistrement.
 */
export async function prepareUploadAction(input: { purpose: UploadPurpose; filename: string; size: number; type: string }): Promise<ActionResult<PreparedUpload>> {
  return runAction<PreparedUpload>({ requireCandidate: true }, async (ctx) => {
    const purpose = input?.purpose === "cv" || input?.purpose === "certificate" ? input.purpose : null;
    if (!purpose) return fail("Type d'envoi inconnu.");
    const type = declaredFileType(String(input.filename ?? ""), String(input.type ?? ""));
    if (purpose === "cv" && type !== "pdf") return fail("Le CV doit être un fichier PDF.");
    if (!type) return fail("Format non accepté : PDF, JPEG, PNG ou WebP uniquement.");
    const size = Number(input.size);
    const maxBytes = await getMaxCvBytes();
    if (!Number.isFinite(size) || size <= 0) return fail("Le fichier est vide.");
    if (size > maxBytes) return fail(`Le fichier dépasse la taille maximale autorisée (${Math.round(maxBytes / 1024 / 1024)} Mo).`);
    if (!(await rateLimit(`${purpose === "cv" ? "cv-upload" : "certificate-upload"}:${ctx.userId}`))) return fail("Trop de téléversements récents. Réessayez dans une heure.");

    const supabase = await createClient();
    await cleanupStaleUploads(supabase, ctx.userId);
    const path = temporaryUploadPath(ctx.userId, type);
    const { data, error } = await supabase.storage.from(DOCUMENTS_BUCKET).createSignedUploadUrl(path);
    if (error || !data) {
      console.error("[documents] URL de téléversement refusée", error?.message);
      return fail("L'envoi n'a pas pu être préparé : votre espace de stockage est peut-être plein (40 fichiers). Supprimez d'anciennes versions puis réessayez.");
    }
    return { ok: true, data: { path, signedUrl: data.signedUrl, contentType: FILE_TYPES[type].mime } };
  });
}
