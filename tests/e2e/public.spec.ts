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

  test("pas de défilement horizontal du téléphone à l'ordinateur (pages publiques)", async ({ page }) => {
    for (const width of [360, 640, 768, 900, 1024]) {
      await page.setViewportSize({ width, height: 900 });
      for (const path of ["/", "/presentation", "/fonctionnement", "/domaines", "/partenaires", "/connexion", "/inscription"]) {
        await page.goto(path);
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        expect(overflow, `${path} à ${width} px`).toBeLessThanOrEqual(1);
      }
    }
  });
});

test.describe("Menu du site public sur téléphone", () => {
  test.skip(({ isMobile }) => !isMobile, "menu hamburger : téléphone uniquement");

  test("le menu hamburger s'ouvre, mène aux pages et se referme", async ({ page }) => {
    await page.goto("/");
    const nav = page.getByRole("navigation", { name: "Navigation publique (mobile)" });
    await expect(nav).toBeHidden();
    await page.getByRole("button", { name: "Ouvrir le menu" }).click();
    await expect(page.getByRole("button", { name: "Fermer le menu" })).toHaveAttribute("aria-expanded", "true");
    await expect(nav.getByRole("link", { name: "Connexion" })).toBeVisible();
    await expect(nav.getByRole("link", { name: "Créer un compte" })).toBeVisible();
    // Échap referme et rend le focus au bouton
    await page.keyboard.press("Escape");
    await expect(nav).toBeHidden();
    await expect(page.getByRole("button", { name: "Ouvrir le menu" })).toBeFocused();
    // un lien mène à la page et referme le menu
    await page.getByRole("button", { name: "Ouvrir le menu" }).click();
    await nav.getByRole("link", { name: "Domaines" }).click();
    await expect(page).toHaveURL(/\/domaines$/);
    await expect(nav).toBeHidden();
    await page.getByRole("button", { name: "Ouvrir le menu" }).click();
    await expect(nav.getByRole("link", { name: "Domaines" })).toHaveAttribute("aria-current", "page");
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
