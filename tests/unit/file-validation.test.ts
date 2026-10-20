import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { checkCertificateFile, detectFileType } from "@/features/documents/file-validation";
import { sanitizeFilename } from "@/features/cv/pdf-validation";

const MB = 1024 * 1024;
const pad = (head: number[], size = 256) => {
  const b = new Uint8Array(size);
  b.set(head);
  return b;
};
const PNG = pad([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const JPEG = pad([0xff, 0xd8, 0xff, 0xe0]);
const WEBP = pad([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]);

describe("justificatifs de certification (PDF ou image)", () => {
  it("reconnaît le type réel par la signature", () => {
    expect(detectFileType(PNG)).toBe("png");
    expect(detectFileType(JPEG)).toBe("jpeg");
    expect(detectFileType(WEBP)).toBe("webp");
    expect(detectFileType(new TextEncoder().encode("%PDF-1.7"))).toBe("pdf");
  });

  it("accepte un vrai PDF et les images JPEG, PNG, WebP", async () => {
    const doc = await PDFDocument.create();
    doc.addPage();
    expect(checkCertificateFile(await doc.save(), 5 * MB)).toMatchObject({ ok: true, type: "pdf" });
    expect(checkCertificateFile(PNG, 5 * MB)).toMatchObject({ ok: true, type: "png" });
    expect(checkCertificateFile(JPEG, 5 * MB)).toMatchObject({ ok: true, type: "jpeg" });
    expect(checkCertificateFile(WEBP, 5 * MB)).toMatchObject({ ok: true, type: "webp" });
  });

  it("refuse les SVG, le HTML et les exécutables renommés", () => {
    const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
    const exe = pad([0x4d, 0x5a, 0x90, 0x00]);
    for (const bytes of [svg, exe, new TextEncoder().encode("<html></html>")]) {
      const r = checkCertificateFile(bytes, 5 * MB);
      expect(r.ok).toBe(false);
      expect(r.reason).toMatch(/Format non accepté/);
    }
  });

  it("refuse un fichier trop lourd ou vide", () => {
    expect(checkCertificateFile(pad([0xff, 0xd8, 0xff], 2 * MB), MB).reason).toMatch(/taille maximale/);
    expect(checkCertificateFile(new Uint8Array(0), MB).reason).toMatch(/vide/);
  });

  it("refuse un PDF à contenu actif", () => {
    const pdf = new TextEncoder().encode("%PDF-1.4\n1 0 obj << /OpenAction << /S /JavaScript /JS (app.alert(1)) >> >>\n%%EOF");
    expect(checkCertificateFile(pdf, MB).ok).toBe(false);
  });

  it("garde la bonne extension dans le nom du fichier", () => {
    expect(sanitizeFilename("photo diplôme.jpeg", "jpg")).toBe("photo diplome.jpeg");
    expect(sanitizeFilename("scan", "png")).toBe("scan.png");
    expect(sanitizeFilename("certificat.pdf")).toBe("certificat.pdf");
  });
});
