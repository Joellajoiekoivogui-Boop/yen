/**
 * Contrôle des justificatifs téléversés (certificats) : PDF ou image (logique pure).
 * Le type est déterminé par la signature réelle du fichier, jamais par son nom
 * ni par le type déclaré par le navigateur. Les images vectorielles (SVG), qui
 * peuvent contenir du script, ne sont pas acceptées.
 */
import { createHash } from "node:crypto";
import { checkPdf } from "@/features/cv/pdf-validation";

export type AllowedFileType = "pdf" | "jpeg" | "png" | "webp";

export const FILE_TYPES: Record<AllowedFileType, { mime: string; ext: string; label: string }> = {
  pdf: { mime: "application/pdf", ext: "pdf", label: "PDF" },
  jpeg: { mime: "image/jpeg", ext: "jpg", label: "JPEG" },
  png: { mime: "image/png", ext: "png", label: "PNG" },
  webp: { mime: "image/webp", ext: "webp", label: "WebP" },
};

const startsWith = (bytes: Uint8Array, sig: number[], offset = 0) => sig.every((b, i) => bytes[offset + i] === b);

export function detectFileType(bytes: Uint8Array): AllowedFileType | null {
  if (startsWith(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d])) return "pdf"; // %PDF-
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "jpeg";
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "png";
  if (startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) && startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8)) return "webp"; // RIFF....WEBP
  return null;
}

export interface FileCheckResult {
  ok: boolean;
  reason?: string;
  type?: AllowedFileType;
  sha256: string;
}

export function checkCertificateFile(bytes: Uint8Array, maxBytes: number): FileCheckResult {
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const fail = (reason: string): FileCheckResult => ({ ok: false, reason, sha256 });
  if (bytes.byteLength === 0) return fail("Le fichier est vide.");
  if (bytes.byteLength > maxBytes) return fail(`Le fichier dépasse la taille maximale autorisée (${Math.round(maxBytes / 1024 / 1024)} Mo).`);

  const type = detectFileType(bytes);
  if (!type) return fail("Format non accepté : envoyez un PDF ou une image JPEG, PNG ou WebP.");

  if (type === "pdf") {
    const pdf = checkPdf(bytes, maxBytes);
    return pdf.ok ? { ok: true, type, sha256 } : fail((pdf.reason ?? "PDF refusé.").replace("Exportez votre CV", "Exportez le document"));
  }
  if (bytes.byteLength < 64) return fail("L'image semble incomplète ou corrompue.");
  return { ok: true, type, sha256 };
}
