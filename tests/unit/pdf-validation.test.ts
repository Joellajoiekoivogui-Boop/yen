import { describe, expect, it } from "vitest";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { checkPdf, sanitizeFilename } from "@/features/cv/pdf-validation";

async function realPdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage();
  page.drawText("CV de test", { font: await doc.embedFont(StandardFonts.Helvetica), x: 50, y: 700 });
  return doc.save();
}

const MB = 1024 * 1024;

describe("contrôle des PDF téléversés", () => {
  it("accepte un vrai PDF", async () => {
    const r = checkPdf(await realPdf(), 5 * MB);
    expect(r.ok).toBe(true);
    expect(r.sha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it("rejette un fichier dont le type réel n'est pas PDF (extension falsifiée)", () => {
    const html = new TextEncoder().encode("<html><script>alert(1)</script></html>");
    const r = checkPdf(html, 5 * MB);
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/signature/);
  });

  it("rejette un exécutable renommé en .pdf", () => {
    const exe = new Uint8Array([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00]);
    expect(checkPdf(exe, 5 * MB).ok).toBe(false);
  });

  it("rejette un fichier trop volumineux", async () => {
    const pdf = await realPdf();
    expect(checkPdf(pdf, 100).reason).toMatch(/taille maximale/);
  });

  it("rejette un fichier vide", () => {
    expect(checkPdf(new Uint8Array(), MB).ok).toBe(false);
  });

  it("rejette un PDF contenant du JavaScript ou une action de lancement", () => {
    const evil = new TextEncoder().encode("%PDF-1.7\n1 0 obj << /OpenAction << /S /JavaScript /JS (app.alert(1)) >> >> endobj\n%%EOF\n");
    const r = checkPdf(evil, MB);
    expect(r.ok).toBe(false);
    expect(r.suspiciousMarkers).toContain("JavaScript intégré");
    const launch = new TextEncoder().encode("%PDF-1.4\n<< /Type /Action /S /Launch /F (cmd.exe) >>\n%%EOF");
    expect(checkPdf(launch, MB).suspiciousMarkers).toContain("Lancement d'application");
  });

  it("rejette un PDF tronqué", () => {
    expect(checkPdf(new TextEncoder().encode("%PDF-1.4\n1 0 obj"), MB).reason).toMatch(/incomplet/);
  });

  it("assainit les noms de fichiers", () => {
    expect(sanitizeFilename("../../etc/passwd")).toBe("passwd.pdf");
    expect(sanitizeFilename("Mon CV <script>.pdf")).toBe("Mon CV _script_.pdf");
    expect(sanitizeFilename("Curriculum Vitæ – Aïssatou.PDF")).toMatch(/\.PDF$/);
  });
});
