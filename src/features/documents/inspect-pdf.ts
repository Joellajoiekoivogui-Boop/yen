import "server-only";
import { extractText, getDocumentProxy } from "unpdf";

export type PdfInspection = { ok: true; pageCount: number; text: string } | { ok: false; reason: string };

/**
 * Ouvre réellement le PDF (lecteur pdf.js) : nombre de pages et texte extrait.
 * Refuse les PDF illisibles et ceux qui exigent un mot de passe pour être ouverts ;
 * les PDF seulement protégés contre la modification s'ouvrent normalement.
 */
export async function inspectPdf(bytes: Uint8Array): Promise<PdfInspection> {
  let pdf;
  try {
    pdf = await getDocumentProxy(new Uint8Array(bytes));
  } catch (e) {
    if ((e as { name?: string } | null)?.name === "PasswordException") {
      return { ok: false, reason: "Ce PDF est protégé par un mot de passe. Enregistrez-le sans mot de passe puis réessayez." };
    }
    return { ok: false, reason: "Ce PDF est illisible ou endommagé. Exportez-le de nouveau en PDF puis réessayez." };
  }
  let text = "";
  try {
    const res = await extractText(pdf, { mergePages: true });
    text = (Array.isArray(res.text) ? res.text.join("\n") : res.text).replace(/\u0000/g, "").trim();
  } catch {
    text = "";
  }
  return { ok: true, pageCount: pdf.numPages, text };
}
