/**
 * Authentification : limitation des tentatives (côté serveur) et redirections internes uniquement.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { clearLoginFailures, LIMITS, loginRetryAfter, recordLoginFailure, resetAttempts, takeEmailRequest } from "@/lib/security/attempts";
import { safeInternalPath } from "@/lib/utils";

const IP = "203.0.113.7";
const OTHER_IP = "198.51.100.20";
const T0 = 1_800_000_000_000;

describe("tentatives de connexion", () => {
  beforeEach(() => resetAttempts());

  it("bloque un compte après trop d'échecs depuis la même adresse, puis le libère après 15 minutes", () => {
    for (let i = 0; i < LIMITS.loginPerAccount; i++) {
      expect(loginRetryAfter(IP, "alice@exemple.test", T0)).toBe(0);
      recordLoginFailure(IP, "alice@exemple.test", T0);
    }
    const wait = loginRetryAfter(IP, "Alice@Exemple.test ", T0 + 1000); // casse et espaces ignorés
    expect(wait).toBeGreaterThan(0);
    expect(wait).toBeLessThanOrEqual(15 * 60);
    expect(loginRetryAfter(IP, "alice@exemple.test", T0 + 15 * 60_000 + 1)).toBe(0);
  });

  it("l'attaquant ne bloque pas le titulaire du compte qui se connecte depuis une autre adresse", () => {
    for (let i = 0; i < LIMITS.loginPerAccount + 5; i++) recordLoginFailure(IP, "victime@exemple.test", T0);
    expect(loginRetryAfter(IP, "victime@exemple.test", T0)).toBeGreaterThan(0);
    expect(loginRetryAfter(OTHER_IP, "victime@exemple.test", T0)).toBe(0);
  });

  it("plafonne aussi les essais sur de nombreux comptes depuis une même adresse", () => {
    for (let i = 0; i < LIMITS.loginPerIp; i++) recordLoginFailure(IP, `compte${i}@exemple.test`, T0);
    expect(loginRetryAfter(IP, "nouveau@exemple.test", T0)).toBeGreaterThan(0);
    expect(loginRetryAfter(OTHER_IP, "nouveau@exemple.test", T0)).toBe(0);
  });

  it("une connexion réussie efface les échecs du compte", () => {
    for (let i = 0; i < LIMITS.loginPerAccount - 1; i++) recordLoginFailure(IP, "bob@exemple.test", T0);
    clearLoginFailures(IP, "bob@exemple.test");
    for (let i = 0; i < LIMITS.loginPerAccount - 1; i++) recordLoginFailure(IP, "bob@exemple.test", T0);
    expect(loginRetryAfter(IP, "bob@exemple.test", T0)).toBe(0);
  });
});

describe("demandes d'e-mail (réinitialisation, renvoi)", () => {
  beforeEach(() => resetAttempts());

  it("limite les demandes par adresse e-mail et par adresse IP", () => {
    for (let i = 0; i < LIMITS.emailPerAccount; i++) expect(takeEmailRequest(IP, "carla@exemple.test", T0)).toBe(0);
    expect(takeEmailRequest(IP, "carla@exemple.test", T0)).toBeGreaterThan(0);
    // d'autres adresses e-mail restent possibles jusqu'au plafond de l'adresse IP
    let accepted = LIMITS.emailPerAccount;
    for (let i = 0; accepted < LIMITS.emailPerIp; i++, accepted++) expect(takeEmailRequest(IP, `autre${i}@exemple.test`, T0)).toBe(0);
    expect(takeEmailRequest(IP, "encore@exemple.test", T0)).toBeGreaterThan(0);
    expect(takeEmailRequest(OTHER_IP, "carla@exemple.test", T0)).toBe(0);
  });
});

describe("redirection après connexion", () => {
  it.each([
    ["/candidat/cv", "/candidat/cv"],
    ["/admin/talents?q=a#x", "/admin/talents?q=a#x"],
  ])("accepte le chemin interne %s", (input, expected) => {
    expect(safeInternalPath(input)).toBe(expected);
  });

  it.each([
    "https://exemple-malveillant.test",
    "//exemple-malveillant.test/connexion",
    "/\\exemple-malveillant.test",
    "\\\\exemple-malveillant.test",
    "/%0d%0aSet-Cookie:x=1".replace("%0d%0a", "\r\n"),
    "javascript:alert(1)",
    "candidat",
    "",
    null,
    42,
  ])("refuse %s", (input) => {
    expect(safeInternalPath(input)).toBeNull();
  });
});
