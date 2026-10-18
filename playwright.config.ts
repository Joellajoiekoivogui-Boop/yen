import { defineConfig, devices } from "@playwright/test";
import { existsSync } from "node:fs";

const chromium = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";

/**
 * - « public » : pages publiques et protections d'accès (application seule).
 * - « parcours » : parcours complet candidat → YEN → partenaire, nécessite une
 *   pile Supabase (E2E_STACK=1, voir tests/e2e-stack/start.sh) avec un
 *   administrateur et les données de démonstration.
 */
export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: [["list"]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    locale: "fr-FR",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    launchOptions: existsSync(chromium) ? { executablePath: chromium } : {},
  },
  projects: [
    { name: "public", testMatch: /public\.spec\.ts/, use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", testMatch: /public\.spec\.ts/, use: { ...devices["Pixel 7"] } },
    { name: "parcours", testMatch: /journey\.spec\.ts/, use: { ...devices["Desktop Chrome"] } },
  ],
});
