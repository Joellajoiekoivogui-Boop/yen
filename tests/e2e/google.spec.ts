/**
 * Connexion avec Google : démarrage côté serveur, envoi vers Google avec les bons paramètres,
 * retours en erreur et redirections internes uniquement. La page de Google est simulée (aucun
 * accès réseau à Google) : l'échange d'un vrai code Google ne peut être vérifié qu'en production.
 * Pile locale : tests/e2e-stack/start.sh (fournisseur Google activé avec des valeurs factices).
 */
import { expect, test } from "@playwright/test";

test.skip(!process.env.E2E_STACK, "Pile Supabase locale requise (E2E_STACK=1)");

test("le bouton Google part vers Google avec un vérificateur PKCE protégé", async ({ page, context }) => {
  // Requête finale de la chaîne de redirections (site → Supabase Auth → Google) : lue, sans dépendre de la page de Google
  await page.route("https://accounts.google.com/**", (route) => route.fulfill({ status: 200, contentType: "text/html", body: "<h1>Google (simulé)</h1>" }));
  await page.goto("/connexion");
  await expect(page.getByText(/En continuant avec Google, vous acceptez/)).toBeVisible();
  const toGoogle = page.waitForRequest((r) => r.url().startsWith("https://accounts.google.com/"));
  await page.getByRole("link", { name: "Continuer avec Google" }).click();
  const google = new URL((await toGoogle).url());

  expect(google.searchParams.get("client_id")).toBe("e2e-google-client");
  expect(google.searchParams.get("prompt")).toBe("select_account");
  expect(google.searchParams.get("redirect_uri")).toBe("http://localhost:54321/auth/v1/callback");
  expect(google.searchParams.get("scope")).toBe("email profile");
  expect(google.searchParams.get("state")).toBeTruthy();

  // vérificateur PKCE : cookie inaccessible aux scripts de la page
  const verifier = (await context.cookies("http://localhost:3000")).find((c) => c.name.includes("code-verifier"));
  expect(verifier?.httpOnly).toBe(true);
});

test("le retour vers une adresse externe est ignoré", async ({ request }) => {
  const res = await request.get("/auth/google?suivant=https://exemple-malveillant.test/vol", { maxRedirects: 0 });
  expect(res.status()).toBe(303);
  const authorize = new URL(res.headers().location);
  const redirectTo = authorize.searchParams.get("redirect_to") ?? "";
  expect(redirectTo).toContain("http://localhost:3000/auth/callback?fournisseur=google");
  expect(redirectTo).not.toContain("exemple-malveillant");

  const internal = await request.get("/auth/google?suivant=/candidat/cv", { maxRedirects: 0 });
  expect(new URL(new URL(internal.headers().location).searchParams.get("redirect_to")!).searchParams.get("suivant")).toBe("/candidat/cv");
});

test("connexion Google annulée ou code invalide : message clair sur la page de connexion", async ({ page }) => {
  await page.goto("/auth/callback?fournisseur=google&error=access_denied&error_description=The+user+denied");
  await expect(page).toHaveURL(/\/connexion\?erreur=google_annule/);
  await expect(page.getByText("Connexion avec Google annulée.", { exact: false })).toBeVisible();

  await page.goto("/auth/callback?fournisseur=google&code=code-invalide");
  await expect(page).toHaveURL(/\/connexion\?erreur=google$/);
  await expect(page.getByText(/La connexion avec Google n'a pas abouti/)).toBeVisible();
});

test("inscription : Google proposé aux candidats, pas aux organisations partenaires", async ({ page }) => {
  await page.goto("/inscription");
  await expect(page.getByRole("link", { name: "S'inscrire avec Google" })).toBeVisible();
  await page.getByRole("tab", { name: "Organisation partenaire" }).click();
  await expect(page.getByRole("link", { name: "S'inscrire avec Google" })).toHaveCount(0);
});
