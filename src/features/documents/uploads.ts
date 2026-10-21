import "server-only";
import { randomUUID } from "node:crypto";
import type { createClient } from "@/lib/supabase/server";
import { FILE_TYPES, type AllowedFileType } from "./file-validation";

/**
 * Envoi direct des fichiers vers le stockage privé.
 * Le navigateur dépose le fichier à un emplacement temporaire grâce à une URL signée
 * à usage unique (aucune limite de taille imposée par l'hébergeur de l'application) ;
 * le serveur le récupère, vérifie son type réel, puis enregistre lui-même la version
 * définitive avec le bon type. L'emplacement temporaire est toujours supprimé.
 */
type Supabase = Awaited<ReturnType<typeof createClient>>;

export const DOCUMENTS_BUCKET = "candidate-documents";
const TEMP_PREFIX = "upload-";
const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";

const BY_MIME: Record<string, AllowedFileType> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpeg",
  "image/jpg": "jpeg",
  "image/pjpeg": "jpeg",
  "image/png": "png",
  "image/webp": "webp",
};
const BY_EXTENSION: Record<string, AllowedFileType> = { pdf: "pdf", jpg: "jpeg", jpeg: "jpeg", png: "png", webp: "webp" };

/** Type annoncé par le navigateur, ou à défaut l'extension : sert seulement à préparer l'envoi (le type réel est vérifié ensuite). */
export function declaredFileType(filename: string, mime: string): AllowedFileType | null {
  return BY_MIME[mime.toLowerCase()] ?? BY_EXTENSION[filename.toLowerCase().split(".").pop() ?? ""] ?? null;
}

export function temporaryUploadPath(userId: string, type: AllowedFileType): string {
  return `${userId}/${TEMP_PREFIX}${randomUUID()}.${FILE_TYPES[type].ext}`;
}

/** Vrai si le chemin est un emplacement temporaire de cet utilisateur (jamais un fichier déjà enregistré). */
export function isTemporaryUploadPath(userId: string, path: unknown): path is string {
  return typeof path === "string" && new RegExp(`^${userId}/${TEMP_PREFIX}${UUID}\\.(pdf|jpg|png|webp)$`).test(path);
}

/** Récupère le fichier déposé par le navigateur puis libère l'emplacement temporaire. */
export async function takeTemporaryUpload(supabase: Supabase, path: string, maxBytes: number): Promise<{ ok: true; bytes: Uint8Array } | { ok: false; reason: string }> {
  const { data, error } = await supabase.storage.from(DOCUMENTS_BUCKET).download(path);
  await supabase.storage.from(DOCUMENTS_BUCKET).remove([path]);
  if (error || !data) return { ok: false, reason: "Le fichier n'est pas arrivé jusqu'au stockage. Vérifiez votre connexion puis réessayez." };
  if (data.size > maxBytes) return { ok: false, reason: `Le fichier dépasse la taille maximale autorisée (${Math.round(maxBytes / 1024 / 1024)} Mo).` };
  return { ok: true, bytes: new Uint8Array(await data.arrayBuffer()) };
}

/** Enregistre la version définitive, avec le type réel du fichier : <user_id>/<uuid>.<ext>. */
export async function storeValidatedFile(supabase: Supabase, userId: string, bytes: Uint8Array, type: AllowedFileType): Promise<string | null> {
  const { mime, ext } = FILE_TYPES[type];
  const path = `${userId}/${randomUUID()}.${ext}`;
  const up = await supabase.storage.from(DOCUMENTS_BUCKET).upload(path, bytes, { contentType: mime, upsert: false, cacheControl: "0" });
  if (up.error) {
    console.error("[documents] enregistrement refusé par le stockage", up.error.message);
    return null;
  }
  return path;
}

/** Supprime les envois temporaires abandonnés depuis plus d'une heure (ils compteraient dans le quota du compte). */
export async function cleanupStaleUploads(supabase: Supabase, userId: string): Promise<void> {
  try {
    const { data } = await supabase.storage.from(DOCUMENTS_BUCKET).list(userId, { search: TEMP_PREFIX, limit: 100 });
    const cutoff = Date.now() - 60 * 60 * 1000;
    const stale = (data ?? []).filter((o) => o.name.startsWith(TEMP_PREFIX) && o.created_at && new Date(o.created_at).getTime() < cutoff).map((o) => `${userId}/${o.name}`);
    if (stale.length) await supabase.storage.from(DOCUMENTS_BUCKET).remove(stale);
  } catch (e) {
    console.error("[documents] nettoyage des envois temporaires impossible", e instanceof Error ? e.message : e);
  }
}
