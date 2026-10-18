import { expect, test } from "@playwright/test";

test.describe("Pages publiques", () => {
  for (const [path, heading] of [
    ["/", /Identifier les talents/],
    ["/presentation", /YEN Career Bridge/],
    ["/fonctionnement", /Du profil à l'insertion/],
    ["/domaines", /Domaines d'ingénierie/],
    ["/partenaires", /Organisations partenaires/],
    ["/confidentialite", /Politique de confidentialité/],
    ["/conditions", /Conditions d'utilisation/],
    ["/connexion", /Connexion/],
    ["/inscription", /Créer un compte/],
  ] as const) {
    test(`${path} s'affiche`, async ({ page }) => {
      const res = await page.goto(path);
      expect(res?.status()).toBeLessThan(400);
      await expect(page.getByRole("heading", { level: 1 })).toContainText(heading);
    });
  }

  test("le catalogue présente au moins 15 domaines et leurs fiches", async ({ page }) => {
    await page.goto("/domaines");
    const cards = page.locator('a[href^="/domaines/"]');
    expect(await cards.count()).toBeGreaterThanOrEqual(15);
    await cards.first().click();
    await expect(page.getByText("Métiers associés")).toBeVisible();
    await expect(page.getByText("Compétences fondamentales")).toBeVisible();
  });

  test("aucun partenaire ni statistique fictifs n'est affiché sur l'accueil", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText(/témoignage/i)).toHaveCount(0);
    await expect(page.getByText(/Démo · fictif|donnée de démonstration/i)).toHaveCount(0);
  });

  test("pas de défilement horizontal", async ({ page }) => {
    await page.goto("/");
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });
});

test.describe("Protection des espaces", () => {
  for (const path of ["/candidat", "/candidat/cv", "/admin", "/admin/talents", "/partenaire", "/partenaire/candidatures"]) {
    test(`${path} redirige vers la connexion sans session`, async ({ page }) => {
      await page.goto(path);
      await expect(page).toHaveURL(/\/connexion/);
    });
  }

  test("les routes de documents refusent l'accès anonyme", async ({ request }) => {
    const r = await request.get("/api/documents/00000000-0000-4000-8000-000000000000", { maxRedirects: 0 });
    expect([401, 404, 307]).toContain(r.status());
    const e = await request.get("/api/admin/export/insertion?debut=2026-01-01&fin=2026-12-31", { maxRedirects: 0 });
    expect([403, 307]).toContain(e.status());
  });

  test("en-têtes de sécurité présents", async ({ request }) => {
    const r = await request.get("/");
    expect(r.headers()["content-security-policy"]).toContain("frame-ancestors 'none'");
    expect(r.headers()["x-content-type-options"]).toBe("nosniff");
    expect(r.headers()["x-powered-by"]).toBeUndefined();
  });
});
