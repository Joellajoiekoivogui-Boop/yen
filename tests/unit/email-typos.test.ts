import { describe, expect, it } from "vitest";
import { suggestEmailFix } from "@/features/auth/email-typos";
import { candidateSignUpSchema, partnerSignUpSchema } from "@/features/auth/schemas";

const partner = { organization_name: "Organisation test", first_name: "A", last_name: "B", password: "Solide-mot-2026", password_confirm: "Solide-mot-2026", accepted_terms: true };

describe("fautes de frappe dans l'adresse e-mail", () => {
  it("propose la bonne adresse pour un domaine mal écrit", () => {
    expect(suggestEmailFix("massaseredou86@gmail.co")).toBe("massaseredou86@gmail.com");
    expect(suggestEmailFix("Awa.Camara@GMIAL.COM")).toBe("Awa.Camara@gmail.com");
    expect(suggestEmailFix("rh@yaho.fr")).toBe("rh@yahoo.fr");
  });

  it("laisse passer les vraies adresses, y compris professionnelles", () => {
    for (const e of ["a@gmail.com", "a@yahoo.fr", "a@hotmail.fr", "rh@entreprise.co", "contact@fata-school.org", "a@outlook.com"]) expect(suggestEmailFix(e)).toBeNull();
  });

  it("refuse l'inscription avec une adresse mal écrite et indique la correction", () => {
    const r = partnerSignUpSchema.safeParse({ ...partner, email: "massaseredou86@gmail.co" });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0].message).toBe("Adresse probablement mal écrite : vouliez-vous dire massaseredou86@gmail.com ?");
    expect(partnerSignUpSchema.safeParse({ ...partner, email: "massaseredou86@gmail.com" }).success).toBe(true);
    const c = candidateSignUpSchema.safeParse({ first_name: "A", last_name: "B", email: "a@gmail.con", phone: "+224 620 00 00 00", password: "Solide-mot-2026", password_confirm: "Solide-mot-2026", accepted_terms: true });
    expect(c.error?.issues.map((i) => i.message)).toContain("Adresse probablement mal écrite : vouliez-vous dire a@gmail.com ?");
  });
});
