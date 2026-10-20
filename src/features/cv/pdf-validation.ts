/**
 * Contrôles de sécurité des PDF téléversés (logique pure).
 *
 * Ces contrôles NE remplacent PAS un antivirus : ils rejettent les fichiers dont
 * le type réel n'est pas PDF et les PDF contenant des fonctions actives
 * inutiles pour un CV (JavaScript, lancement d'application, fichiers intégrés…).
 * Un antivirus (ClamAV) peut être branché via CLAMAV_SCAN_URL (voir cv/scanner.ts).
 */
import { createHash } from "node:crypto";

export interface PdfCheckResult {
  ok: boolean;
  reason?: string;
  sha256: string;
  suspiciousMarkers: string[];
}

const ACTIVE_CONTENT_MARKERS: { pattern: RegExp; label: string }[] = [
  { pattern: /\/JavaScript\b/, label: "JavaScript intégré" },
  { pattern: /\/JS\s*[(<\[]/, label: "Action JavaScript" },
  { pattern: /\/Launch\b/, label: "Lancement d'application" },
  { pattern: /\/EmbeddedFile\b/, label: "Fichier intégré" },
  { pattern: /\/RichMedia\b/, label: "Contenu multimédia actif" },
  { pattern: /\/XFA\b/, label: "Formulaire XFA" },
  { pattern: /\/SubmitForm\b/, label: "Soumission de formulaire" },
  { pattern: /\/ImportData\b/, label: "Import de données" },
];

/** Nom de fichier sûr, avec l'extension attendue (pdf par défaut). */
export function sanitizeFilename(name: string, ext = "pdf"): string {
  const base = name.split(/[\\/]/).pop() ?? `document.${ext}`;
  const cleaned = base
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9._ -]/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
  const extensions = ext === "jpg" ? [".jpg", ".jpeg"] : [`.${ext}`];
  return extensions.some((e) => cleaned.toLowerCase().endsWith(e)) ? cleaned : `${cleaned || "document"}.${ext}`;
}

export function checkPdf(bytes: Uint8Array, maxBytes: number): PdfCheckResult {
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const fail = (reason: string, markers: string[] = []): PdfCheckResult => ({ ok: false, reason, sha256, suspiciousMarkers: markers });

  if (bytes.byteLength === 0) return fail("Le fichier est vide.");
  if (bytes.byteLength > maxBytes) {
    return fail(`Le fichier dépasse la taille maximale autorisée (${Math.round(maxBytes / 1024 / 1024)} Mo).`);
  }
  // Signature réelle : %PDF- au tout début du fichier (type déclaré ignoré)
  const head = Buffer.from(bytes.subarray(0, 8)).toString("latin1");
  if (!head.startsWith("%PDF-")) return fail("Le fichier n'est pas un PDF valide (signature absente).");

  // Fin de fichier attendue dans les derniers octets
  const tail = Buffer.from(bytes.subarray(Math.max(0, bytes.byteLength - 2048))).toString("latin1");
  if (!tail.includes("%%EOF")) return fail("Le PDF semble incomplet ou corrompu.");

  const text = Buffer.from(bytes).toString("latin1");
  const markers = ACTIVE_CONTENT_MARKERS.filter((m) => m.pattern.test(text)).map((m) => m.label);
  if (markers.length > 0) {
    return fail(`Ce PDF contient du contenu actif non autorisé (${markers.join(", ")}). Exportez votre CV en PDF standard puis réessayez.`, markers);
  }
  if (/\/Encrypt\b/.test(text)) {
    return fail("Ce PDF est protégé par mot de passe ou chiffré. Téléversez une version non protégée.");
  }
  return { ok: true, sha256, suspiciousMarkers: [] };
}
