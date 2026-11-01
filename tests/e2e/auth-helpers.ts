/**
 * Choix de la méthode sur les pages d'accès : le lien par e-mail est proposé par défaut, le mot
 * de passe s'affiche à la demande. Le clic est répété tant que la page n'est pas interactive.
 */
import { expect, type Page } from "@playwright/test";

async function reveal(page: Page, toggleName: string, fieldName: string) {
  const field = page.getByRole("textbox", { name: fieldName, exact: true });
  const toggle = page.getByRole("button", { name: toggleName });
  await expect(async () => {
    if (!(await field.isVisible())) await toggle.click({ timeout: 1000 });
    await expect(field).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 15_000 });
}

/** Page de connexion : affiche le champ mot de passe (choix retenu ensuite sur l'appareil). */
export const choosePasswordSignIn = (page: Page) => reveal(page, "Se connecter avec un mot de passe", "Mot de passe");

/** Page d'inscription : affiche le formulaire avec mot de passe. */
export const choosePasswordSignUp = (page: Page) => reveal(page, "Créer un compte avec un mot de passe", "Retapez le mot de passe");
