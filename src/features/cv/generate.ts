import "server-only";
import { PDFDocument, rgb, StandardFonts, type PDFFont, type PDFPage } from "pdf-lib";
import { levelLabel } from "@/lib/labels";
import type { CandidateBundle } from "@/features/candidates/queries";

/**
 * Génère un CV PDF à partir des SEULES données du profil (saisies ou validées
 * par le candidat). Aucune information n'est inventée : les sections vides sont
 * omises. Les compétences démontrées sont distinguées des compétences déclarées.
 */
const WIN_ANSI_EXTRA = new Set("€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ");
function sanitize(s: string): string {
  return [...s.replace(/\r/g, "")]
    .map((ch) => {
      const c = ch.charCodeAt(0);
      if (ch === "\n" || (c >= 32 && c <= 126) || (c >= 160 && c <= 255) || WIN_ANSI_EXTRA.has(ch)) return ch;
      const base = ch.normalize("NFD").replace(/[̀-ͯ]/g, "");
      return base.length === 1 && base.charCodeAt(0) < 256 ? base : "?";
    })
    .join("");
}

const NAVY = rgb(0.06, 0.13, 0.26);
const BLUE = rgb(0.1, 0.33, 0.94);
const GREY = rgb(0.36, 0.42, 0.51);
const TEXT = rgb(0.13, 0.16, 0.22);

class Writer {
  page: PDFPage;
  y: number;
  readonly margin = 50;
  constructor(private doc: PDFDocument, private font: PDFFont, private bold: PDFFont) {
    this.page = doc.addPage([595.28, 841.89]);
    this.y = 841.89 - this.margin;
  }
  get width() {
    return 595.28 - this.margin * 2;
  }
  ensure(h: number) {
    if (this.y - h < this.margin) {
      this.page = this.doc.addPage([595.28, 841.89]);
      this.y = 841.89 - this.margin;
    }
  }
  wrap(text: string, size: number, font: PDFFont, width: number): string[] {
    const lines: string[] = [];
    for (const para of sanitize(text).split("\n")) {
      let line = "";
      for (const word of para.split(/\s+/)) {
        const test = line ? `${line} ${word}` : word;
        if (font.widthOfTextAtSize(test, size) > width && line) {
          lines.push(line);
          line = word;
        } else line = test;
      }
      lines.push(line);
    }
    return lines;
  }
  text(text: string, opts: { size?: number; bold?: boolean; color?: ReturnType<typeof rgb>; indent?: number; gap?: number } = {}) {
    const size = opts.size ?? 10;
    const font = opts.bold ? this.bold : this.font;
    const lines = this.wrap(text, size, font, this.width - (opts.indent ?? 0));
    for (const l of lines) {
      this.ensure(size + 4);
      this.page.drawText(l, { x: this.margin + (opts.indent ?? 0), y: this.y - size, size, font, color: opts.color ?? TEXT });
      this.y -= size + 3;
    }
    this.y -= opts.gap ?? 2;
  }
  section(title: string) {
    this.ensure(30);
    this.y -= 8;
    this.page.drawText(sanitize(title.toUpperCase()), { x: this.margin, y: this.y - 11, size: 11, font: this.bold, color: BLUE });
    this.y -= 15;
    this.page.drawLine({ start: { x: this.margin, y: this.y }, end: { x: this.margin + this.width, y: this.y }, thickness: 0.6, color: rgb(0.85, 0.88, 0.93) });
    this.y -= 8;
  }
}

const yearRange = (a: string | number | null, b: string | number | null, current = false) => {
  const f = (v: string | number | null) => (v == null ? "" : String(v).slice(0, 7));
  return [f(a), current ? "aujourd'hui" : f(b)].filter(Boolean).join(" – ");
};

export async function generateCvPdf(b: CandidateBundle, opts: { includeContact: boolean }): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(sanitize(`CV – ${b.person?.first_name ?? ""} ${b.person?.last_name ?? ""}`));
  doc.setProducer("YEN Career Bridge");
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const w = new Writer(doc, font, bold);

  w.text(`${b.person?.first_name ?? ""} ${b.person?.last_name ?? ""}`.trim() || "Candidat", { size: 20, bold: true, color: NAVY, gap: 0 });
  if (b.candidate.headline) w.text(b.candidate.headline, { size: 12, color: BLUE });
  const contact = [
    [b.person?.city, b.person?.country].filter(Boolean).join(", "),
    opts.includeContact ? b.person?.email : null,
    opts.includeContact ? b.person?.phone : null,
    b.candidate.linkedin_url, b.candidate.github_url, b.candidate.portfolio_url,
  ].filter(Boolean).join("  ·  ");
  if (contact) w.text(contact, { size: 9, color: GREY });
  w.text(`Identifiant YEN : ${b.candidate.public_code}`, { size: 8, color: GREY, gap: 6 });

  if (b.candidate.summary) {
    w.section("Profil");
    w.text(b.candidate.summary);
  }

  const demonstrated = new Map<string, { name: string; level: string }>();
  for (const s of b.skillAssessments) {
    if (s.status !== "valide" || !s.skills) continue;
    const cur = demonstrated.get(s.skill_id);
    if (!cur) demonstrated.set(s.skill_id, { name: s.skills.name, level: s.level });
  }
  if (demonstrated.size || b.declaredSkills.length) {
    w.section("Compétences");
    if (demonstrated.size) {
      w.text("Compétences évaluées par YEN :", { bold: true, size: 9.5 });
      w.text([...demonstrated.values()].map((d) => `${d.name} (${levelLabel[d.level as keyof typeof levelLabel]})`).join(" · "), { indent: 8 });
    }
    const declaredOnly = b.declaredSkills.filter((d) => !demonstrated.has(d.skill_id) && d.skills);
    if (declaredOnly.length) {
      w.text("Autres compétences déclarées :", { bold: true, size: 9.5 });
      w.text(declaredOnly.map((d) => d.skills!.name).join(" · "), { indent: 8 });
    }
  }

  if (b.experiences.length) {
    w.section("Expériences");
    for (const e of b.experiences) {
      w.text(`${e.title} — ${e.organization}`, { bold: true, gap: 0 });
      w.text([yearRange(e.start_date, e.end_date, e.is_current), e.city].filter(Boolean).join(" · "), { size: 9, color: GREY, gap: 1 });
      if (e.description) w.text(e.description, { indent: 8 });
      if (e.achievements) w.text(`Réalisations : ${e.achievements}`, { indent: 8 });
      w.y -= 4;
    }
  }

  if (b.projects.length) {
    w.section("Projets");
    for (const p of b.projects) {
      w.text(p.title + (p.verification_status === "verifie" ? "  (projet vérifié par YEN)" : ""), { bold: true, gap: 0 });
      if (p.technologies.length) w.text(p.technologies.join(", "), { size: 9, color: GREY, gap: 1 });
      w.text(p.description, { indent: 8 });
      if (p.outcomes) w.text(`Résultats : ${p.outcomes}`, { indent: 8 });
      w.y -= 4;
    }
  }

  if (b.education.length) {
    w.section("Formation");
    for (const e of b.education) {
      w.text(`${e.degree}${e.field_of_study ? ` — ${e.field_of_study}` : ""}`, { bold: true, gap: 0 });
      w.text([e.institution, yearRange(e.start_year, e.end_year)].filter(Boolean).join(" · "), { size: 9, color: GREY, gap: 4 });
    }
  }

  if (b.certifications.length) {
    w.section("Certifications");
    for (const c of b.certifications) w.text(`${c.name} — ${c.issuer}${c.issue_date ? ` (${c.issue_date.slice(0, 7)})` : ""}`);
  }

  if (b.languages.length) {
    w.section("Langues");
    w.text(b.languages.map((l) => `${l.language} (${l.proficiency})`).join(" · "));
  }

  return doc.save();
}
