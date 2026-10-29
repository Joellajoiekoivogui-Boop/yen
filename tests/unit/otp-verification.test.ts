/**
 * Vérification de l'adresse par code : format accepté côté serveur et limitation des codes erronés.
 * La génération et la vérification du code restent assurées par Supabase Auth.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { verifySignupSchema } from "@/features/auth/schemas";
import { clearOtpFailures, LIMITS, otpRetryAfter, recordOtpFailure, resetAttempts } from "@/lib/security/attempts";

const IP = "203.0.113.7";
const OTHER_IP = "198.51.100.20";
const T0 = 1_800_000_000_000;

describe("format du code de vérification", () => {
  const parse = (code: string) => verifySignupSchema.safeParse({ email: " Awa@Exemple.test ", code });

  it("accepte 6 chiffres, avec espaces ou tirets collés depuis l'e-mail", () => {
    for (const code of ["123456", "123 456", " 123-456 "]) {
      const r = parse(code);
      expect(r.success).toBe(true);
      expect(r.data).toEqual({ email: "awa@exemple.test", code: "123456" });
    }
  });

  it("accepte jusqu'à 10 chiffres si le projet Supabase est réglé ainsi", () => {
    expect(parse("12345678").success).toBe(true);
  });

  it("refuse un code vide, trop court, trop long ou avec des lettres", () => {
    for (const code of ["", "12345", "12345678901", "12a456"]) expect(parse(code).success).toBe(false);
    expect(parse("").error?.issues[0].message).toBe("Saisissez le code reçu par e-mail.");
  });
});

describe("codes erronés", () => {
  beforeEach(() => resetAttempts());

  it("suspend la vérification d'un compte après trop de codes erronés depuis la même adresse, pendant 15 minutes", () => {
    for (let i = 0; i < LIMITS.otpPerAccount; i++) {
      expect(otpRetryAfter(IP, "awa@exemple.test", T0)).toBe(0);
      recordOtpFailure(IP, "awa@exemple.test", T0);
    }
    const wait = otpRetryAfter(IP, "AWA@exemple.test", T0 + 1000);
    expect(wait).toBeGreaterThan(0);
    expect(wait).toBeLessThanOrEqual(15 * 60);
    expect(otpRetryAfter(IP, "awa@exemple.test", T0 + 15 * 60_000 + 1)).toBe(0);
  });

  it("plafonne les essais sur un même compte depuis de nombreuses adresses (code à 6 chiffres)", () => {
    for (let i = 0; i < LIMITS.otpPerAccountAnyIp; i++) recordOtpFailure(`198.51.100.${i}`, "cible@exemple.test", T0);
    expect(otpRetryAfter("192.0.2.99", "cible@exemple.test", T0)).toBeGreaterThan(0);
    // les autres comptes ne sont pas concernés
    expect(otpRetryAfter("192.0.2.99", "autre@exemple.test", T0)).toBe(0);
  });

  it("plafonne les essais sur de nombreux comptes depuis une même adresse", () => {
    for (let i = 0; i < LIMITS.otpPerIp; i++) recordOtpFailure(IP, `compte${i}@exemple.test`, T0);
    expect(otpRetryAfter(IP, "nouveau@exemple.test", T0)).toBeGreaterThan(0);
    expect(otpRetryAfter(OTHER_IP, "nouveau@exemple.test", T0)).toBe(0);
  });

  it("un code accepté efface les échecs du compte", () => {
    for (let i = 0; i < LIMITS.otpPerAccount - 1; i++) recordOtpFailure(IP, "bob@exemple.test", T0);
    clearOtpFailures(IP, "bob@exemple.test");
    for (let i = 0; i < LIMITS.otpPerAccount - 1; i++) recordOtpFailure(IP, "bob@exemple.test", T0);
    expect(otpRetryAfter(IP, "bob@exemple.test", T0)).toBe(0);
  });
});
