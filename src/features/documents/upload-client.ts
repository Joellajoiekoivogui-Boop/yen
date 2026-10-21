import { prepareUploadAction, stageUploadAction, type UploadPurpose } from "./actions";

export type DirectUploadResult = { ok: true; path: string } | { ok: false; error: string };

const NETWORK_ERROR = "La connexion a été interrompue pendant l'envoi. Vérifiez votre connexion internet puis réessayez.";
/** Envoi de secours par le serveur : limite de l'hébergeur (4,5 Mo par requête), marge comprise. */
const SERVER_FALLBACK_MAX_BYTES = 4 * 1024 * 1024;

function storageError(status: number, body: string): string {
  let message = "";
  try {
    message = String((JSON.parse(body) as { message?: string }).message ?? "");
  } catch {
    /* réponse non JSON */
  }
  if (/mime/i.test(message)) return "Ce format est refusé par le stockage : la base de données de la plateforme doit être mise à jour (script 4-MISE-A-JOUR.sql). Prévenez l'équipe YEN.";
  if (status === 413 || /maximum allowed size|too large/i.test(message)) return "Le fichier est trop volumineux pour le stockage.";
  return `L'envoi du fichier a échoué (code ${status}). Réessayez dans un instant.`;
}

/**
 * Envoie le fichier directement au stockage privé grâce à une URL signée à usage unique,
 * avec suivi de la progression (utile sur les connexions lentes).
 * Renvoie l'emplacement temporaire à transmettre à l'action d'enregistrement.
 */
export async function uploadDirect(file: File, purpose: UploadPurpose, onProgress?: (percent: number) => void): Promise<DirectUploadResult> {
  let prepared;
  try {
    prepared = await prepareUploadAction({ purpose, filename: file.name, size: file.size, type: file.type });
  } catch {
    return { ok: false, error: NETWORK_ERROR };
  }
  if (!prepared.ok) return { ok: false, error: prepared.error };
  if (!prepared.data) return { ok: false, error: "L'envoi n'a pas pu être préparé. Réessayez." };
  const { path, signedUrl, contentType } = prepared.data;

  // même format que le client Supabase dans le navigateur : formulaire multipart, type imposé par le serveur
  const body = new FormData();
  body.append("cacheControl", "0");
  body.append("", new File([file], file.name, { type: contentType }));

  const direct = await new Promise<DirectUploadResult | "network">((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", signedUrl);
    xhr.setRequestHeader("x-upsert", "false");
    xhr.timeout = 10 * 60 * 1000;
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress?.(Math.min(99, Math.round((e.loaded / e.total) * 100)));
    };
    xhr.onload = () => resolve(xhr.status >= 200 && xhr.status < 300 ? { ok: true, path } : { ok: false, error: storageError(xhr.status, xhr.responseText) });
    // échec réseau : adresse du stockage injoignable ou bloquée (pare-feu, politique de sécurité du navigateur)
    xhr.onerror = () => resolve("network");
    xhr.ontimeout = () => resolve("network");
    xhr.send(body);
  });
  if (direct !== "network") return direct;

  // Secours : envoi par le serveur de la plateforme (fichiers de 4 Mo au plus)
  if (file.size > SERVER_FALLBACK_MAX_BYTES) return { ok: false, error: NETWORK_ERROR };
  onProgress?.(50);
  const fd = new FormData();
  fd.set("path", path);
  fd.set("file", new File([file], file.name, { type: contentType }));
  try {
    const staged = await stageUploadAction(fd);
    return staged.ok ? { ok: true, path } : { ok: false, error: staged.error };
  } catch {
    return { ok: false, error: NETWORK_ERROR };
  }
}
