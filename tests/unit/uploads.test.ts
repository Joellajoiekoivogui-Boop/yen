import { describe, expect, it } from "vitest";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { isCommonPassword, passwordStrength } from "@/features/auth/password-rules";
import { candidateSignUpSchema, passwordSchema } from "@/features/auth/schemas";
import { checkPdf } from "@/features/cv/pdf-validation";
import { checkCertificateFile } from "@/features/documents/file-validation";
import { inspectPdf } from "@/features/documents/inspect-pdf";
import { declaredFileType, isTemporaryUploadPath, temporaryUploadPath } from "@/features/documents/uploads";

const MB = 1024 * 1024;
const USER = "8a1f2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d";

async function pdf(text = "Certificat de formation"): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.addPage().drawText(text, { font: await doc.embedFont(StandardFonts.Helvetica), x: 50, y: 700 });
  return doc.save();
}

describe("mot de passe", () => {
  it("8 caractères suffisent, sans majuscule ni symbole obligatoire", () => {
    expect(passwordSchema.safeParse("conakry2025").success).toBe(true);
    expect(passwordSchema.safeParse("court12").success).toBe(false);
  });
  it("refuse les mots de passe les plus courants", () => {
    expect(isCommonPassword("12345678")).toBe(true);
    expect(isCommonPassword("AZERTYUIOP")).toBe(true);
    expect(isCommonPassword("aaaaaaaa")).toBe(true);
    expect(passwordSchema.safeParse("motdepasse").error?.issues[0].message).toMatch(/trop courant/);
  });
  it("donne une solidité indicative", () => {
    expect(passwordStrength("")).toBe(0);
    expect(passwordStrength("abc")).toBe(1);
    expect(passwordStrength("conakry2025")).toBe(2);
    expect(passwordStrength("Conakry-2025!")).toBe(4);
  });
  it("inscription candidat : quelques champs seulement, mots de passe identiques", () => {
    const base = { first_name: "Aïssatou", last_name: "Bah", email: "a@b.test", phone: "+224 620 00 00 00", city: "Conakry", password: "conakry2025", accepted_terms: true };
    expect(candidateSignUpSchema.safeParse({ ...base, password_confirm: "conakry2025" }).success).toBe(true);
    const r = candidateSignUpSchema.safeParse({ ...base, password_confirm: "conakry2026" });
    expect(r.error?.issues[0].path).toEqual(["password_confirm"]);
  });
});

describe("contrôle des PDF", () => {
  it("accepte un PDF précédé de quelques octets parasites", async () => {
    const bytes = await pdf();
    const padded = new Uint8Array([...new TextEncoder().encode("\r\n  "), ...bytes]);
    expect(checkPdf(padded, MB).ok).toBe(true);
    expect(checkCertificateFile(padded, MB).type).toBe("pdf");
  });
  it("accepte un PDF protégé contre la modification (le lecteur l'ouvre sans mot de passe)", async () => {
    const text = new TextDecoder("latin1").decode(await pdf());
    const withEncryptName = new TextEncoder().encode(text.replace("%%EOF", "% /Encrypt (dictionnaire de permissions)\n%%EOF"));
    expect(checkPdf(withEncryptName, MB).ok).toBe(true);
  });
  it("ouvre réellement le PDF : pages et texte", async () => {
    const r = await inspectPdf(await pdf("Developpeur web junior"));
    expect(r.ok && r.pageCount).toBe(1);
    expect(r.ok && r.text).toContain("Developpeur web junior");
  });
  it("refuse un PDF illisible", async () => {
    const r = await inspectPdf(new TextEncoder().encode("%PDF-1.7\nceci n'est pas un PDF\n%%EOF"));
    expect(r.ok).toBe(false);
  });
});

describe("envoi direct vers le stockage", () => {
  it("déduit le type annoncé du type MIME ou, à défaut, de l'extension", () => {
    expect(declaredFileType("cv.pdf", "application/pdf")).toBe("pdf");
    expect(declaredFileType("photo.JPG", "")).toBe("jpeg");
    expect(declaredFileType("scan.jpeg", "application/octet-stream")).toBe("jpeg");
    expect(declaredFileType("page.html", "text/html")).toBeNull();
    expect(declaredFileType("image.svg", "image/svg+xml")).toBeNull();
  });
  it("n'accepte que les emplacements temporaires du compte", () => {
    const path = temporaryUploadPath(USER, "pdf");
    expect(isTemporaryUploadPath(USER, path)).toBe(true);
    expect(isTemporaryUploadPath("00000000-0000-4000-8000-000000000000", path)).toBe(false);
    expect(isTemporaryUploadPath(USER, `${USER}/1b4e28ba-2fa1-11d2-883f-0016d3cca427.pdf`)).toBe(false);
    expect(isTemporaryUploadPath(USER, `${USER}/upload-../../autre.pdf`)).toBe(false);
    expect(isTemporaryUploadPath(USER, `${USER}/upload-1b4e28ba-2fa1-11d2-883f-0016d3cca427.html`)).toBe(false);
  });
});
