/**
 * Parcours complet sur une pile Supabase locale (tests/e2e-stack/start.sh),
 * avec un administrateur (scripts/create-admin.ts) et les données de démo.
 * Variables : E2E_STACK=1, E2E_ADMIN_EMAIL, E2E_ADMIN_PASSWORD, E2E_DEMO_PASSWORD.
 */
import { expect, test, type Page } from "@playwright/test";
import { PDFDocument, StandardFonts } from "pdf-lib";

test.skip(!process.env.E2E_STACK, "Pile Supabase locale requise (E2E_STACK=1)");
test.describe.configure({ mode: "serial" });

const stamp = Date.now();
const candidate = { email: `e2e.${stamp}@example.test`, password: "Candidat-E2e-2026", lastName: `Parcours${stamp}` };
const ADMIN = { email: process.env.E2E_ADMIN_EMAIL ?? "admin@yen.test", password: process.env.E2E_ADMIN_PASSWORD ?? "" };
const RECRUITER = { email: "recruteur@demo.yen-career-bridge.invalid", password: process.env.E2E_DEMO_PASSWORD ?? "" };
let candidateUrl = "";

async function login(page: Page, email: string, password: string) {
  await page.goto("/connexion");
  await page.getByRole("textbox", { name: "Adresse e-mail" }).fill(email);
  await page.getByRole("textbox", { name: "Mot de passe" }).fill(password);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/connexion"), { timeout: 20_000 });
}

async function logout(page: Page) {
  await page.context().clearCookies();
}

async function cvPdf(): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const page = doc.addPage();
  const lines = [
    "Test E2E - CV fictif", "Développeur web junior", "Compétences : JavaScript, HTML, CSS, SQL, Git",
    "Expérience : Stagiaire développeur, Entreprise fictive, 2025", "Formation : Licence informatique, Université fictive, 2025",
    "Projet : Annuaire en ligne réalisé avec React et PostgreSQL pour une association.",
  ];
  lines.forEach((l, i) => page.drawText(l.normalize("NFD").replace(/[̀-ͯ]/g, ""), { x: 50, y: 760 - i * 22, size: 12, font }));
  return Buffer.from(await doc.save());
}

test("un candidat crée son compte et se connecte", async ({ page }) => {
  await page.goto("/inscription");
  const f = (label: string, v: string) => page.getByRole(label.startsWith("Année") ? "spinbutton" : "textbox", { name: label, exact: true }).fill(v);
  await f("Prénom", "Test");
  await f("Nom", candidate.lastName);
  await f("Adresse e-mail", candidate.email);
  await page.getByRole("button", { name: "Créer mon compte" }).click();
  await expect(page.getByText("Numéro de téléphone requis.")).toBeVisible();
  await f("Téléphone", "+224 620 11 22 33");
  await f("Ville", "Conakry");
  await f("Établissement de formation", "Université fictive");
  await f("Formation suivie chez YEN", "Développement web full-stack");
  await f("Niveau d'études", "Licence");
  await f("Année de formation ou de diplomation", "2025");
  await page.getByRole("combobox", { name: "Domaine d'intérêt principal" }).selectOption({ label: "Génie informatique et développement logiciel" });
  await page.getByLabel("Stage").check();
  await page.getByRole("textbox", { name: "Mot de passe", exact: true }).fill(candidate.password);
  await page.getByRole("textbox", { name: "Confirmer le mot de passe", exact: true }).fill(candidate.password);
  await page.getByRole("checkbox", { name: /J'accepte/ }).check();
  await page.getByRole("button", { name: "Créer mon compte" }).click();
  // Selon la configuration Supabase : message de confirmation par e-mail, ou session ouverte directement
  await expect(page.getByText("Vérifiez votre boîte de réception").or(page.getByRole("heading", { name: "Tableau de bord" }))).toBeVisible({ timeout: 20_000 });
  await logout(page);

  await login(page, candidate.email, candidate.password);
  await expect(page).toHaveURL(/\/candidat$/);
  await expect(page.getByText(/YEN-CB-\d{6}/)).toBeVisible();
  await expect(page.getByText("Mesure le renseignement du profil, pas vos compétences.")).toBeVisible();
});

test("le candidat complète son profil, ses consentements et ses compétences", async ({ page }) => {
  await login(page, candidate.email, candidate.password);
  await page.goto("/candidat/profil");
  await page.getByRole("textbox", { name: "Titre professionnel" }).fill("Développeur web junior");
  await page.getByRole("textbox", { name: "Résumé professionnel" }).fill("Développeur web formé chez YEN, à l'aise avec JavaScript, React et SQL. Je recherche un stage pour consolider mes compétences sur des projets réels.");
  await page.getByRole("button", { name: "Enregistrer" }).first().click();
  await expect(page.getByText("Profil enregistré.")).toBeVisible();

  await page.getByRole("button", { name: "Ajouter une formation" }).click();
  await page.getByRole("textbox", { name: "Diplôme ou formation", exact: true }).fill("Licence informatique");
  await page.getByRole("textbox", { name: "Établissement", exact: true }).fill("Université fictive");
  await page.getByRole("button", { name: "Ajouter une formation" }).click();
  await expect(page.getByText("Licence informatique")).toBeVisible();

  await page.goto("/candidat/parametres");
  for (const name of [/Analyse de mon profil/, /Visibilité dans le vivier/, /Partage de mon profil/]) await page.getByRole("checkbox", { name }).check();
  await page.getByRole("button", { name: "Enregistrer mes préférences" }).click();
  await expect(page.getByText("Préférences enregistrées.")).toBeVisible();

  await page.goto("/candidat/competences");
  for (const skill of ["JavaScript / TypeScript", "Développement web front-end", "Bases de données SQL"]) {
    await page.getByRole("button", { name: "Déclarer une compétence" }).click();
    await page.getByRole("combobox", { name: "Compétence", exact: true }).selectOption({ label: `${skill} — Génie informatique et développement logiciel` });
    await page.getByRole("combobox", { name: "Niveau auto-évalué" }).selectOption("intermediaire");
    await page.getByRole("button", { name: "Déclarer une compétence" }).click();
    await expect(page.getByText(skill).first()).toBeVisible();
  }
  await expect(page.getByText("À démontrer").first()).toBeVisible();
});

test("le candidat passe une évaluation corrigée automatiquement", async ({ page }) => {
  await login(page, candidate.email, candidate.password);
  await page.goto("/candidat/evaluations");
  await page.getByRole("link", { name: /Fondamentaux du développement web/ }).click();
  await expect(page.getByText("Barème et règles de correction")).toBeVisible();
  await page.getByRole("button", { name: /Commencer l'évaluation/ }).click();
  await page.waitForURL(/tentative/);
  await page.getByLabel("<h1>").check();
  await page.getByLabel("[2, 4, 6]").check();
  await page.getByLabel("WHERE", { exact: true }).check();
  await page.getByLabel("Utiliser des requêtes paramétrées").check();
  await page.getByLabel("Valider les entrées côté serveur").check();
  await page.getByLabel("Votre réponse").fill("git switch -c feature");
  await page.getByRole("button", { name: "Soumettre" }).click();
  await expect(page.getByText("100 %").first()).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("Détail par compétence")).toBeVisible();

  await page.goto("/candidat/competences");
  await expect(page.getByRole("heading", { name: "Compétences démontrées" })).toBeVisible();
  await expect(page.getByRole("cell", { name: "JavaScript / TypeScript" }).first()).toBeVisible();
  // jamais « Expert » automatiquement
  await expect(page.getByRole("cell", { name: "Expert" })).toHaveCount(0);
});

test("le candidat téléverse un CV PDF et refuse un faux PDF", async ({ page }) => {
  await login(page, candidate.email, candidate.password);
  await page.goto("/candidat/cv");
  await page.locator("#cv-file").setInputFiles({ name: "faux.pdf", mimeType: "application/pdf", buffer: Buffer.from("<html>pas un pdf</html>") });
  await page.getByRole("button", { name: "Téléverser" }).click();
  await expect(page.getByText(/signature absente/)).toBeVisible();

  await page.locator("#cv-file").setInputFiles({ name: "mon-cv.pdf", mimeType: "application/pdf", buffer: await cvPdf() });
  await page.getByRole("button", { name: "Téléverser" }).click();
  await expect(page.getByText(/^CV téléversé et texte extrait/)).toBeVisible({ timeout: 20_000 });
  await page.reload();
  await expect(page.getByText("mon-cv.pdf").first()).toBeVisible();
  await expect(page.getByText("Texte lisible")).toBeVisible();

  const href = await page.getByRole("link", { name: "Télécharger" }).first().getAttribute("href");
  const res = await page.request.get(href!, { maxRedirects: 0 });
  expect(res.status()).toBe(307);
  expect(res.headers().location).toContain("token=");
  const file = await page.request.get(href!);
  expect((await file.body()).subarray(0, 5).toString()).toBe("%PDF-");

  const generated = await page.request.get("/api/candidat/cv-genere");
  expect(generated.headers()["content-type"]).toBe("application/pdf");
});

test("le candidat joint un certificat en image et voit son aperçu", async ({ page }) => {
  await login(page, candidate.email, candidate.password);
  await page.goto("/candidat/certifications");
  await page.getByRole("button", { name: "Ajouter une certification" }).click();
  await page.getByRole("textbox", { name: /^Certification/ }).fill("Certificat E2E");
  await page.getByRole("textbox", { name: /^Organisme/ }).fill("Organisme fictif");
  await page.locator("main form").getByRole("button", { name: "Ajouter une certification" }).click();
  await expect(page.getByText("Certificat E2E")).toBeVisible();

  const input = page.locator('input[type="file"][accept*="image/png"]').first();
  await input.setInputFiles({ name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("pas un certificat") });
  await expect(page.getByText(/Format non accepté/)).toBeVisible();

  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");
  await input.setInputFiles({ name: "certificat.png", mimeType: "image/png", buffer: png });
  await expect(page.getByText("Justificatif ajouté à la certification.")).toBeVisible({ timeout: 20_000 });
  const thumb = page.getByRole("img", { name: "Justificatif : certificat.png" });
  await expect(thumb).toBeVisible();
  await expect.poll(() => thumb.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0)).toBe(true);

  const file = await page.request.get((await thumb.getAttribute("src"))!);
  expect(file.headers()["content-type"]).toBe("image/png");
});

test("le candidat consulte les métiers et postule à une offre", async ({ page }) => {
  await login(page, candidate.email, candidate.password);
  await page.goto("/candidat/metiers");
  await expect(page.getByText(/pas une probabilité d'embauche/).first()).toBeVisible();
  await page.goto("/candidat/offres");
  await page.getByRole("link", { name: /Stage développeur web \(démo\)/ }).click();
  await expect(page.getByText("Ma compatibilité avec cette offre")).toBeVisible();
  await page.getByRole("button", { name: "Postuler" }).click();
  await expect(page.getByText(/Candidature envoyée/)).toBeVisible();
  await page.goto("/candidat/candidatures");
  await expect(page.getByText("Stage développeur web (démo)")).toBeVisible();
});

test("un candidat ne peut pas accéder à l'administration ni aux documents d'autrui", async ({ page }) => {
  await login(page, candidate.email, candidate.password);
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/candidat/);
  await page.goto("/partenaire/candidatures");
  await expect(page).not.toHaveURL(/\/partenaire\/candidatures/);
  const r = await page.request.get("/api/admin/export/talents");
  expect(r.status()).toBe(403);
});

test("le responsable YEN consulte le candidat, le classement et transmet au partenaire", async ({ page }) => {
  test.skip(!ADMIN.password, "E2E_ADMIN_PASSWORD requis");
  await login(page, ADMIN.email, ADMIN.password);
  await expect(page).toHaveURL(/\/admin/);
  await expect(page.getByText("Candidats inscrits")).toBeVisible();

  await page.goto(`/admin/talents?q=${candidate.lastName}`);
  await expect(page.getByRole("link", { name: "+224 620 11 22 33" })).toBeVisible();
  await page.getByRole("link", { name: `Test ${candidate.lastName}` }).click();
  await page.waitForURL(/\/admin\/talents\/[0-9a-f-]{36}/);
  candidateUrl = page.url().split("?")[0];
  // Dossier complet : coordonnées, CV, formations, certificats et compétences sur une seule page
  await expect(page.getByRole("link", { name: "Appeler" })).toHaveAttribute("href", "tel:+224620112233");
  await expect(page.getByRole("link", { name: "WhatsApp" })).toHaveAttribute("href", "https://wa.me/224620112233");
  await expect(page.getByText("mon-cv.pdf")).toBeVisible();
  await expect(page.getByText("Formations suivies")).toBeVisible();
  const thumb = page.getByRole("img", { name: "Justificatif : certificat.png" });
  await expect(thumb).toBeVisible();
  await expect.poll(() => thumb.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0)).toBe(true);
  await page.getByRole("button", { name: "Vérifier", exact: true }).click();
  await expect(page.getByText("Certification vérifiée.")).toBeVisible();
  await expect(page.getByText("Vérifiée", { exact: true })).toBeVisible();
  await expect(page.getByText("Notes internes")).toBeVisible();
  await page.getByRole("textbox", { name: /Note interne/ }).fill("Profil solide sur le front-end, à confirmer en entretien.");
  await page.getByRole("button", { name: "Ajouter la note" }).click();
  await expect(page.getByText("Profil solide sur le front-end").first()).toBeVisible();

  await page.goto(`${candidateUrl}?onglet=demontrees`);
  await expect(page.getByRole("cell", { name: /JavaScript/ }).first()).toBeVisible();

  await page.goto("/admin/offres");
  await page.getByRole("link", { name: "Stage développeur web (démo)" }).click();
  await expect(page.getByText(/Vivier : candidats ayant consenti/)).toBeVisible();
  await page.getByRole("link", { name: "Candidatures et présélection" }).click();
  const row = page.getByRole("row", { name: new RegExp(`Test ${candidate.lastName}`) });
  await row.getByRole("button", { name: "Proposer au partenaire" }).click();
  await expect(row.getByText("Proposée au partenaire")).toBeVisible();

  await page.goto("/admin/audit");
  await expect(page.getByText("internal_notes").first()).toBeVisible();
  await page.goto("/admin/rapports");
  await expect(page.getByText("Méthode de calcul")).toBeVisible();
});

test("le partenaire voit la candidature transmise, sans coordonnées ni notes internes", async ({ page }) => {
  test.skip(!RECRUITER.password, "E2E_DEMO_PASSWORD requis");
  await login(page, RECRUITER.email, RECRUITER.password);
  await expect(page).toHaveURL(/\/partenaire/);
  await page.goto("/partenaire/candidatures");
  await page.getByRole("row").filter({ hasText: "Stage développeur web (démo)" }).filter({ hasText: "Proposée au partenaire" }).getByRole("link").first().click();
  await expect(page.getByText("Compétences démontrées")).toBeVisible();
  await expect(page.getByText(candidate.email)).toHaveCount(0);
  await expect(page.getByText("Profil solide sur le front-end")).toHaveCount(0);
  await page.goto("/admin");
  await expect(page).not.toHaveURL(/\/admin/);
  // Un profil non partagé est introuvable pour le partenaire
  await page.goto("/partenaire/profils/00000000-0000-4000-8000-000000000000");
  await expect(page.getByText(/introuvable|404|could not be found/i).first()).toBeVisible();
});
