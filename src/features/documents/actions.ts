"use server";

import { getMaxCvBytes } from "@/features/admin/settings";
import { fail, rateLimit, runAction, type ActionResult } from "@/lib/action";
import { isDatabaseUpToDate, UPLOADS_SCHEMA_VERSION } from "@/lib/schema-version";
import { createClient } from "@/lib/supabase/server";
import { FILE_TYPES } from "./file-validation";
import { cleanupStaleUploads, declaredFileType, DOCUMENTS_BUCKET, isTemporaryUploadPath, temporaryUploadPath } from "./uploads";

const UPLOADS_NOT_READY =
  "Le dépôt de fichiers n'est pas encore activé sur la plateforme : l'administrateur doit mettre à jour la base de données (fichier supabase/installation/4-MISE-A-JOUR.sql à exécuter dans Supabase › SQL Editor).";

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
    // base sans la dernière mise à jour SQL : règles de stockage et fonctions d'enregistrement absentes
    if (!(await isDatabaseUpToDate(UPLOADS_SCHEMA_VERSION))) return fail(UPLOADS_NOT_READY);
    if (!(await rateLimit(`${purpose === "cv" ? "cv-upload" : "certificate-upload"}:${ctx.userId}`))) return fail("Trop de téléversements récents. Réessayez dans une heure.");

    const supabase = await createClient();
    await cleanupStaleUploads(supabase, ctx.userId);
    const path = temporaryUploadPath(ctx.userId, type);
    const { data, error } = await supabase.storage.from(DOCUMENTS_BUCKET).createSignedUploadUrl(path);
    if (error || !data) {
      console.error("[documents] URL de téléversement refusée", error?.message);
      return fail(
        /row-level security|unauthorized|403/i.test(error?.message ?? "")
          ? "Envoi refusé par le stockage : votre espace contient déjà 40 fichiers. Supprimez d'anciennes versions de CV ou d'anciens certificats puis réessayez."
          : "L'envoi n'a pas pu être préparé. Réessayez dans un instant.",
      );
    }
    return { ok: true, data: { path, signedUrl: data.signedUrl, contentType: FILE_TYPES[type].mime } };
  });
}

/**
 * Solution de secours quand l'envoi direct vers le stockage est impossible depuis le navigateur
 * (réseau ou pare-feu qui bloque l'adresse du stockage) : le fichier passe par le serveur,
 * dans la limite de l'hébergeur (4 Mo), vers le même emplacement temporaire.
 */
export async function stageUploadAction(formData: FormData): Promise<ActionResult> {
  return runAction({ requireCandidate: true }, async (ctx) => {
    const path = formData.get("path");
    const file = formData.get("file");
    if (!isTemporaryUploadPath(ctx.userId, path)) return fail("Envoi introuvable. Recommencez le téléversement.");
    if (!(file instanceof File) || file.size === 0) return fail("Aucun fichier reçu.");
    const maxBytes = await getMaxCvBytes();
    if (file.size > maxBytes) return fail(`Le fichier dépasse la taille maximale autorisée (${Math.round(maxBytes / 1024 / 1024)} Mo).`);
    const type = declaredFileType(path, "");
    if (!type) return fail("Format non accepté.");
    const supabase = await createClient();
    const { error } = await supabase.storage
      .from(DOCUMENTS_BUCKET)
      .upload(path, new Uint8Array(await file.arrayBuffer()), { contentType: FILE_TYPES[type].mime, upsert: false, cacheControl: "0" });
    // déjà présent : l'envoi direct a abouti malgré l'erreur vue par le navigateur
    if (error && !/exists|duplicate/i.test(error.message)) {
      console.error("[documents] envoi de secours refusé", error.message);
      return fail("Le fichier n'a pas pu être envoyé. Réessayez dans un instant.");
    }
    return { ok: true };
  });
}
