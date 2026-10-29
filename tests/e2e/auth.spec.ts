/**
 * Authentification par e-mail et mot de passe : connexion, erreurs, limitation des tentatives,
 * redirections, déconnexion, session invalide, récupération de compte.
 * Pile Supabase locale requise (E2E_STACK=1) ; comptes de test synthétiques uniquement.
 */
import { createHmac, randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import pg from "pg";
import { mailbox, verificationCode, wrongCode } from "./mailbox";

test.skip(!process.env.E2E_STACK, "Pile Supabase locale requise (E2E_STACK=1)");

const SUPABASE = process.env.E2E_SUPABASE_URL ?? "http://localhost:54321";
const DEMO = { email: "candidat3@demo.yen-career-bridge.invalid", password: process.env.E2E_DEMO_PASSWORD ?? "" };

/** Clé de service de la pile locale (signée avec le secret JWT de test), pour l'API d'administration de Supabase Auth. */
function localServiceKey() {
  const secret = process.env.E2E_JWT_SECRET ?? "super-secret-jwt-token-with-at-least-32-characters-long";
  const b = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const head = b({ alg: "HS256", typ: "JWT" });
  const body = b({ role: "service_role", iss: "supabase-local", exp: Math.floor(Date.now() / 1000) + 600 });
  return `${head}.${body}.${createHmac("sha256", secret).update(`${head}.${body}`).digest("base64url")}`;
}
async function authAdmin(path: string, body: object) {
  const key = localServiceKey();
  const res = await fetch(`${SUPABASE}/auth/v1/admin/${path}`, { method: "POST", headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, body: JSON.stringify(body) });
  expect(res.ok, `${path} : ${res.status}`).toBeTruthy();
  return res.json();
}

async function fillLogin(page: Page, email: string, password: string) {
  await page.getByRole("textbox", { name: "Adresse e-mail" }).fill(email);
  await page.getByRole("textbox", { name: "Mot de passe" }).fill(password);
  await page.getByRole("button", { name: "Se connecter" }).click();
}

test("identifiants incorrects : message neutre, adresse conservée, aucune session", async ({ page, context }) => {
  for (const email of [DEMO.email, `inconnu.${Date.now()}@example.test`]) {
    await page.goto("/connexion");
    await fillLogin(page, email, "Mauvais-mot-2026");
    await expect(page.getByText("Adresse e-mail ou mot de passe incorrect.")).toBeVisible();
    await expect(page).toHaveURL(/\/connexion/);
    await expect(page.getByRole("textbox", { name: "Adresse e-mail" })).toHaveValue(email);
  }
  expect((await context.cookies()).some((c) => c.name.startsWith("sb-") && c.name.includes("auth-token"))).toBe(false);
});

test("trop d'échecs : connexion suspendue pour cette adresse, sans bloquer le titulaire ailleurs", async ({ browser }) => {
  const email = `cible.${Date.now()}@example.test`;
  const attacker = await browser.newContext({ extraHTTPHeaders: { "x-forwarded-for": "203.0.113.50" } });
  const page = await attacker.newPage();
  await page.goto("/connexion");
  for (let i = 0; i < 8; i++) {
    await fillLogin(page, email, `Essai-${i}-2026`);
    await expect(page.getByText("Adresse e-mail ou mot de passe incorrect.")).toBeVisible();
  }
  await fillLogin(page, email, "Encore-un-essai-2026");
  await expect(page.getByText(/Trop de tentatives de connexion\. Réessayez dans \d+ minute/)).toBeVisible();
  await attacker.close();
  // depuis une autre adresse, le même compte n'est pas bloqué
  const owner = await browser.newContext({ extraHTTPHeaders: { "x-forwarded-for": "198.51.100.51" } });
  const p2 = await owner.newPage();
  await p2.goto("/connexion");
  await fillLogin(p2, email, "Autre-essai-2026");
  await expect(p2.getByText("Adresse e-mail ou mot de passe incorrect.")).toBeVisible();
  await owner.close();
});

test("après connexion : retour vers la page demandée, jamais vers un autre site", async ({ page, context }) => {
  await page.goto("/connexion?suivant=https://exemple-malveillant.test/vol");
  await fillLogin(page, DEMO.email, DEMO.password);
  await page.waitForURL((u) => !u.pathname.startsWith("/connexion"));
  await expect(page).toHaveURL(/localhost:3000\/candidat$/);
  // chemin qui, une fois normalisé, deviendrait « //exemple-malveillant.test »
  await context.clearCookies();
  await page.goto("/connexion?suivant=/.//exemple-malveillant.test/vol");
  await fillLogin(page, DEMO.email, DEMO.password);
  await page.waitForURL((u) => !u.pathname.startsWith("/connexion"));
  await expect(page).toHaveURL(/localhost:3000\/candidat$/);
  await context.clearCookies();
  await page.goto("/candidat/cv");
  await expect(page).toHaveURL(/\/connexion\?suivant=%2Fcandidat%2Fcv/);
  await fillLogin(page, DEMO.email, DEMO.password);
  await expect(page).toHaveURL(/\/candidat\/cv$/);
});

test("session existante : connexion et inscription renvoient vers l'espace du compte", async ({ page }) => {
  await page.goto("/connexion");
  await fillLogin(page, DEMO.email, DEMO.password);
  await page.waitForURL(/\/candidat$/);
  await page.goto("/connexion");
  await expect(page).toHaveURL(/\/candidat$/);
  await page.goto("/inscription");
  await expect(page).toHaveURL(/\/candidat$/);
});

test("déconnexion : session fermée, espaces privés de nouveau inaccessibles", async ({ page, context, request }) => {
  await page.goto("/connexion");
  await fillLogin(page, DEMO.email, DEMO.password);
  await page.waitForURL(/\/candidat$/);
  await page.getByRole("button", { name: "Se déconnecter" }).first().click();
  await page.waitForURL((u) => u.pathname === "/");
  expect((await context.cookies()).filter((c) => c.name.startsWith("sb-") && c.name.includes("auth-token") && c.value)).toHaveLength(0);
  await page.goto("/candidat");
  await expect(page).toHaveURL(/\/connexion\?suivant=%2Fcandidat/);
  // déconnexion forcée depuis un autre site refusée (CSRF)
  const res = await request.post("/auth/deconnexion", { headers: { Origin: "https://exemple-malveillant.test" }, maxRedirects: 0 });
  expect(res.status()).toBe(403);
});

test("session invalide ou falsifiée : traitée comme une absence de session", async ({ page, context }) => {
  await page.goto("/connexion");
  await fillLogin(page, DEMO.email, DEMO.password);
  await page.waitForURL(/\/candidat$/);
  const session = (await context.cookies()).filter((c) => c.name.startsWith("sb-") && c.name.includes("auth-token"));
  expect(session.length).toBeGreaterThan(0);
  await context.clearCookies();
  await context.addCookies(session.map((c) => ({ ...c, value: "base64-eyJmYXV4Ijp0cnVlfQ" })));
  await page.goto("/candidat");
  await expect(page).toHaveURL(/\/connexion/);
  // et aucune donnée privée n'est servie par l'API interne
  const api = await page.request.get("/api/candidat/cv", { maxRedirects: 0 });
  expect([302, 303, 307, 401, 403, 404]).toContain(api.status());
});

test("liens de retour invalides : message clair sur la page de connexion", async ({ page }) => {
  await page.goto("/auth/callback?code=code-invalide");
  await expect(page).toHaveURL(/\/connexion\?erreur=lien/);
  await expect(page.getByText("Le lien utilisé est invalide ou a expiré. Demandez un nouveau lien.")).toBeVisible();
  await page.goto("/reinitialiser-mot-de-passe");
  await expect(page).toHaveURL(/\/connexion\?erreur=lien/);
});

test("mot de passe oublié : même réponse que le compte existe ou non", async ({ page }) => {
  for (const email of [DEMO.email, `absent.${Date.now()}@example.test`]) {
    await page.goto("/mot-de-passe-oublie");
    await page.getByRole("textbox", { name: "Adresse e-mail" }).fill(email);
    await page.getByRole("button", { name: "Envoyer le lien" }).click();
    await expect(page.getByText("Si un compte correspond à cette adresse, un lien de réinitialisation vient d'être envoyé.").first()).toBeVisible();
  }
});

test("récupération de compte : le lien reçu permet de choisir un nouveau mot de passe", async ({ page, context }) => {
  // compte de test créé pour l'occasion (adresse synthétique)
  const email = `recuperation.${Date.now()}.${randomUUID().slice(0, 6)}@example.test`;
  await authAdmin("users", { email, password: "Ancien-mot-2026", email_confirm: true, user_metadata: { first_name: "Test", last_name: "Recuperation", phone: "+224 620 00 00 01", city: "Conakry", account_type: "candidate", accepted_terms: "true" } });
  const link = await authAdmin("generate_link", { type: "recovery", email });
  const hashed: string = link.hashed_token ?? link.properties?.hashed_token;
  expect(hashed).toBeTruthy();

  await page.goto(`/auth/callback?token_hash=${hashed}&type=recovery&suivant=/reinitialiser-mot-de-passe`);
  await expect(page.getByRole("heading", { level: 1, name: "Nouveau mot de passe" })).toBeVisible();
  await page.getByRole("textbox", { name: "Nouveau mot de passe" }).fill("Nouveau-mot-2026");
  await page.getByRole("textbox", { name: "Confirmer", exact: true }).fill("Nouveau-mot-2026");
  await page.getByRole("button", { name: "Enregistrer le nouveau mot de passe" }).click();
  await expect(page.getByText(/Mot de passe mis à jour/).first()).toBeVisible();

  // le lien ne sert qu'une fois
  await context.clearCookies();
  await page.goto(`/auth/callback?token_hash=${hashed}&type=recovery&suivant=/reinitialiser-mot-de-passe`);
  await expect(page).toHaveURL(/\/connexion\?erreur=lien/);
  // l'ancien mot de passe ne fonctionne plus, le nouveau oui
  await fillLogin(page, email, "Ancien-mot-2026");
  await expect(page.getByText("Adresse e-mail ou mot de passe incorrect.")).toBeVisible();
  await fillLogin(page, email, "Nouveau-mot-2026");
  await page.waitForURL(/\/candidat/);
});

test("changement de mot de passe depuis les paramètres : le mot de passe actuel est exigé", async ({ page, context }) => {
  const email = `parametres.${Date.now()}.${randomUUID().slice(0, 6)}@example.test`;
  await authAdmin("users", { email, password: "Actuel-mot-2026", email_confirm: true, user_metadata: { first_name: "Test", last_name: "Parametres", phone: "+224 620 00 00 03", city: "Conakry", account_type: "candidate", accepted_terms: "true" } });
  await page.goto("/connexion");
  await fillLogin(page, email, "Actuel-mot-2026");
  await page.waitForURL(/\/candidat/);
  await page.goto("/candidat/parametres");
  const fill = async (current: string) => {
    await page.getByRole("textbox", { name: "Mot de passe actuel" }).fill(current);
    await page.getByRole("textbox", { name: "Nouveau mot de passe" }).fill("Nouveau-mot-2026");
    await page.getByRole("textbox", { name: "Confirmer", exact: true }).fill("Nouveau-mot-2026");
    await page.getByRole("button", { name: "Changer le mot de passe" }).click();
  };
  // une session ouverte ne suffit pas : sans le mot de passe actuel, rien ne change
  await fill("Mauvais-mot-2026");
  await expect(page.getByText(/Mot de passe actuel incorrect/)).toBeVisible();
  await fill("Actuel-mot-2026");
  await expect(page.getByText(/Mot de passe mis à jour/).first()).toBeVisible();
  await context.clearCookies();
  await page.goto("/connexion");
  await fillLogin(page, email, "Actuel-mot-2026");
  await expect(page.getByText("Adresse e-mail ou mot de passe incorrect.")).toBeVisible();
  await fillLogin(page, email, "Nouveau-mot-2026");
  await page.waitForURL(/\/candidat/);
});

test("inscription : données invalides refusées avant tout envoi", async ({ page }) => {
  let actions = 0;
  page.on("request", (r) => { if (r.method() === "POST" && r.headers()["next-action"]) actions++; });
  await page.goto("/inscription");
  await page.getByRole("textbox", { name: "Prénom" }).fill("Test");
  await page.getByRole("textbox", { name: "Nom", exact: true }).fill("Invalide");
  await page.getByRole("textbox", { name: "Adresse e-mail" }).fill("pas-une-adresse");
  await page.getByRole("textbox", { name: "Mot de passe", exact: true }).fill("12345678");
  await page.getByRole("textbox", { name: "Retapez le mot de passe" }).fill("autre-chose");
  await page.getByRole("button", { name: "Créer mon compte" }).click();
  await expect(page.getByText("Adresse e-mail invalide.")).toBeVisible();
  await expect(page.getByText("Numéro de téléphone requis.")).toBeVisible();
  await expect(page.getByText("Ville requise.")).toBeVisible();
  await expect(page.getByText(/Ce mot de passe est trop courant/)).toBeVisible();
  await expect(page.getByText("Vous devez accepter les conditions d'utilisation.")).toBeVisible();
  // une faute de frappe connue dans l'adresse est signalée, avec la correction
  await page.getByRole("textbox", { name: "Adresse e-mail" }).fill("massaseredou86@gmail.co");
  await page.getByRole("button", { name: "Créer mon compte" }).click();
  await expect(page.getByText("Adresse probablement mal écrite : vouliez-vous dire massaseredou86@gmail.com ?")).toBeVisible();
  // une fois les champs corrigés, la confirmation différente est signalée à son tour
  await page.getByRole("textbox", { name: "Téléphone" }).fill("+224 620 00 00 02");
  await page.getByRole("textbox", { name: "Ville" }).fill("Conakry");
  await page.getByRole("textbox", { name: "Adresse e-mail" }).fill(`invalide.${Date.now()}@example.test`);
  await page.getByRole("textbox", { name: "Mot de passe", exact: true }).fill("Solide-mot-2026");
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Créer mon compte" }).click();
  await expect(page.getByText("Les deux mots de passe ne sont pas identiques.")).toBeVisible();
  expect(actions).toBe(0);
});

test("coordonnées obligatoires : l'espace candidat reste fermé tant qu'elles manquent", async ({ page }) => {
  // compte comme après une inscription avec Google : nom connu, ni téléphone ni ville
  const email = `coordonnees.${Date.now()}.${randomUUID().slice(0, 6)}@example.test`;
  await authAdmin("users", { email, password: "Coordonnees-2026", email_confirm: true, user_metadata: { first_name: "Awa", last_name: "Coordonnees", account_type: "candidate", accepted_terms: "true" } });
  await page.goto("/connexion");
  await fillLogin(page, email, "Coordonnees-2026");
  await page.waitForURL(/\/coordonnees$/);
  await expect(page.getByRole("heading", { level: 1, name: "Vos coordonnées" })).toBeVisible();
  // aucune page de l'espace n'est accessible en attendant
  await page.goto("/candidat/offres");
  await expect(page).toHaveURL(/\/coordonnees$/);
  await expect(page.getByRole("textbox", { name: "Prénom" })).toHaveValue("Awa");
  await page.getByRole("button", { name: "Accéder à mon espace" }).click();
  await expect(page.getByText("Numéro de téléphone requis.")).toBeVisible();
  await expect(page.getByText("Ville requise.")).toBeVisible();
  await page.getByRole("textbox", { name: "Téléphone" }).fill("+224 620 44 55 66");
  await page.getByRole("textbox", { name: "Ville" }).fill("Kankan");
  await page.getByRole("button", { name: "Accéder à mon espace" }).click();
  await page.waitForURL(/\/candidat$/);
  await expect(page.getByRole("heading", { name: "Tableau de bord" })).toBeVisible();
  // une fois renseignées, la page ne se présente plus
  await page.goto("/coordonnees");
  await expect(page).toHaveURL(/\/candidat$/);
});

/* -----------------------------------------------------------------------------
   Vérification de l'adresse par code (Supabase Auth génère, envoie et vérifie le code ;
   en production l'e-mail part par Resend, ici dans la boîte de test locale)
   ----------------------------------------------------------------------------- */

const DB_URL = process.env.E2E_DB_URL ?? "postgres://postgres@localhost:54329/yen_e2e";
const freshEmail = (label: string) => `${label}.${Date.now()}.${randomUUID().slice(0, 6)}@example.test`;

async function signUp(page: Page, email: string, password = "Inscription-2026") {
  await page.goto("/inscription");
  const f = (name: string, value: string) => page.getByRole("textbox", { name, exact: true }).fill(value);
  await f("Prénom", "Test");
  await f("Nom", "Verification");
  await f("Téléphone", "+224 620 55 66 77");
  await f("Ville", "Conakry");
  await f("Adresse e-mail", email);
  await f("Mot de passe", password);
  await f("Retapez le mot de passe", password);
  await page.getByRole("checkbox", { name: /J'accepte/ }).check();
  await page.getByRole("button", { name: "Créer mon compte" }).click();
  await page.waitForURL(/\/verification$/, { timeout: 20_000 });
}

async function enterCode(page: Page, code: string) {
  await page.getByRole("textbox", { name: "Code de vérification" }).fill(code);
  await page.getByRole("button", { name: "Vérifier mon adresse" }).click();
}

test("inscription : le code reçu par e-mail active le compte, un code faux est refusé", async ({ page, context }) => {
  const email = freshEmail("code");
  await signUp(page, email);
  await expect(page.getByRole("heading", { level: 1, name: "Vérifiez votre adresse e-mail" })).toBeVisible();
  // l'adresse vient d'un cookie httpOnly, jamais de l'adresse de la page
  await expect(page.getByText(email)).toBeVisible();
  expect(page.url()).not.toContain("example.test");
  const code = await verificationCode(email);
  const [mail] = await mailbox(email);
  expect(mail.subject).toBe("Votre code de vérification YEN Career Bridge");

  // pas de session avant la vérification
  await page.goto("/candidat");
  await expect(page).toHaveURL(/\/connexion/);
  await page.goto("/verification");

  await enterCode(page, wrongCode(code));
  await expect(page.getByText(/Code incorrect ou expiré\. Vérifiez le dernier e-mail/)).toBeVisible();
  await enterCode(page, code);
  await page.waitForURL(/\/candidat$/);
  await expect(page.getByRole("heading", { name: "Tableau de bord" })).toBeVisible();

  // un code ne sert qu'une fois ; ensuite la connexion se fait avec le mot de passe
  await context.clearCookies();
  await page.goto("/verification");
  await page.getByRole("textbox", { name: "Adresse e-mail" }).fill(email);
  await enterCode(page, code);
  await expect(page.getByText(/Code incorrect ou expiré/).first()).toBeVisible();
  await page.goto("/connexion");
  await fillLogin(page, email, "Inscription-2026");
  await page.waitForURL(/\/candidat$/);
});

test("renvoi du code : après le délai, le nouveau code remplace l'ancien", async ({ page }) => {
  const email = freshEmail("renvoi");
  await signUp(page, email);
  const first = await verificationCode(email, 1);
  const resend = page.getByRole("button", { name: /Renvoyer un code/ });
  // délai avant de pouvoir redemander un code (intervalle minimal de Supabase)
  await expect(resend).toBeDisabled();
  await expect(resend).toHaveText(/dans \d+ s/);
  await expect(resend).toBeEnabled({ timeout: 70_000 });
  await resend.click();
  await expect(page.getByText(/un nouveau code vient d'être envoyé/)).toBeVisible();
  const second = await verificationCode(email, 2);
  expect(second).not.toBe(first);
  await expect(resend).toBeDisabled();

  await enterCode(page, first);
  await expect(page.getByText(/Code incorrect ou expiré/).first()).toBeVisible();
  await enterCode(page, second);
  await page.waitForURL(/\/candidat$/);
});

test("code expiré : refusé avec un message clair", async ({ page }) => {
  const email = freshEmail("expire");
  await signUp(page, email);
  const code = await verificationCode(email);
  // simulation de l'expiration : l'envoi date d'il y a deux heures (validité réglée à une heure)
  const db = new pg.Client({ connectionString: DB_URL });
  await db.connect();
  try {
    await db.query("update auth.users set confirmation_sent_at = now() - interval '2 hours' where email = $1", [email]);
  } finally {
    await db.end();
  }
  await enterCode(page, code);
  await expect(page.getByText(/Code incorrect ou expiré\. Vérifiez le dernier e-mail reçu/)).toBeVisible();
  await page.goto("/candidat");
  await expect(page).toHaveURL(/\/connexion/);
});

test("codes erronés répétés : la vérification est suspendue pour ce compte", async ({ page }) => {
  const email = freshEmail("tentatives");
  await signUp(page, email);
  const code = await verificationCode(email);
  const wrong = wrongCode(code);
  for (let i = 0; i < 5; i++) {
    await enterCode(page, wrong);
    await expect(page.getByText(/Code incorrect ou expiré/).first()).toBeVisible();
  }
  // même le bon code attend la fin de la suspension
  await enterCode(page, code);
  await expect(page.getByText(/Trop de codes erronés\. Réessayez dans \d+ minute/)).toBeVisible();
  await page.goto("/candidat");
  await expect(page).toHaveURL(/\/connexion/);
});

test("connexion avant vérification : le site mène à la saisie du code", async ({ page, context }) => {
  const email = freshEmail("non-verifie");
  await signUp(page, email, "Avant-code-2026");
  const code = await verificationCode(email);
  await context.clearCookies();
  await page.goto("/connexion");
  await fillLogin(page, email, "Avant-code-2026");
  await expect(page.getByText("Votre adresse e-mail n'est pas encore vérifiée : saisissez le code reçu par e-mail lors de l'inscription.")).toBeVisible();
  await page.getByRole("link", { name: "Saisir mon code de vérification" }).click();
  await page.waitForURL(/\/verification$/);
  await expect(page.getByText(email)).toBeVisible();
  await enterCode(page, code);
  await page.waitForURL(/\/candidat$/);
});

test("adresse déjà inscrite : même page de vérification, aucun e-mail envoyé (pas d'énumération)", async ({ page }) => {
  const before = (await mailbox(DEMO.email)).length;
  await signUp(page, DEMO.email, "Tentative-2026x");
  await expect(page.getByRole("heading", { level: 1, name: "Vérifiez votre adresse e-mail" })).toBeVisible();
  await page.waitForTimeout(2000);
  expect((await mailbox(DEMO.email)).length).toBe(before);
});
