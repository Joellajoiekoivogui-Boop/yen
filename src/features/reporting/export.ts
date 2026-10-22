import "server-only";
import { PDFDocument, rgb, StandardFonts } from "pdf-lib";

/**
 * CSV compatible tableur (séparateur « ; », BOM UTF-8), protégé contre l'injection de formules.
 * Chaque cellule est entre guillemets : un tableur qui découperait aussi sur la virgule
 * (« Dupont,=FORMULE() ») garde la cellule entière, dont le début est neutralisé.
 */
export function toCsv(headers: string[], rows: (string | number | null | undefined)[][]): string {
  const cell = (v: string | number | null | undefined) => {
    let s = v == null ? "" : String(v);
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return `"${s.replace(/"/g, '""')}"`;
  };
  return "﻿" + [headers, ...rows].map((r) => r.map(cell).join(";")).join("\r\n");
}

export interface InsertionReport {
  period_start: string;
  period_end: string;
  denominator: number;
  denominator_definition: string;
  placed_confirmed: number;
  internships_confirmed: number;
  jobs_confirmed: number;
  placements_declared_unconfirmed: number;
  applications_in_progress: number;
  insertion_rate: number | null;
  by_month: { month: string; stages: number; emplois: number }[];
  by_domain: { domain: string; placed: number }[];
  demo_data_included: boolean;
}

const clean = (s: string) => s.replace(/[^\x20-\xFF€’–—…]/g, "?");

export async function insertionReportPdf(r: InsertionReport, generatedBy: string): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595.28, 841.89]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  let y = 790;
  const line = (text: string, size = 10, f = font, color = rgb(0.13, 0.16, 0.22)) => {
    page.drawText(clean(text), { x: 50, y, size, font: f, color });
    y -= size + 6;
  };
  line("YEN Career Bridge — Rapport d'insertion professionnelle", 15, bold, rgb(0.06, 0.13, 0.26));
  line(`Période : du ${r.period_start} au ${r.period_end}`, 11);
  if (r.demo_data_included) line("ATTENTION : ce rapport inclut des données de démonstration fictives.", 10, bold, rgb(0.7, 0.3, 0));
  y -= 8;
  line(`Taux d'insertion : ${r.insertion_rate == null ? "non calculable (dénominateur nul)" : `${String(r.insertion_rate).replace(".", ",")} %`}`, 13, bold);
  line(`Numérateur : ${r.placed_confirmed} candidat(s) avec au moins un placement CONFIRMÉ débutant dans la période.`);
  line(`Dénominateur : ${r.denominator} candidat(s).`);
  for (const chunk of r.denominator_definition.match(/.{1,95}(\s|$)/g) ?? []) line(`  ${chunk.trim()}`, 9);
  y -= 6;
  line(`Stages confirmés : ${r.internships_confirmed}   ·   Emplois confirmés : ${r.jobs_confirmed}`);
  line(`Placements déclarés non confirmés (hors taux) : ${r.placements_declared_unconfirmed}`);
  line(`Candidatures en cours (hors taux) : ${r.applications_in_progress}`);
  y -= 10;
  line("Placements confirmés par mois", 11, bold);
  for (const m of r.by_month) line(`${m.month} : ${m.stages} stage(s), ${m.emplois} emploi(s)`);
  if (!r.by_month.length) line("Aucun placement confirmé.", 9);
  y -= 10;
  line("Candidats placés par domaine principal", 11, bold);
  for (const d of r.by_domain) line(`${d.domain} : ${d.placed}`);
  if (!r.by_domain.length) line("—", 9);
  y = 50;
  line(`Généré le ${new Date().toLocaleString("fr-FR", { timeZone: "Africa/Conakry" })} par ${generatedBy}. Document interne YEN.`, 8, font, rgb(0.4, 0.45, 0.5));
  return doc.save();
}
