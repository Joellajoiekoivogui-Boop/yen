import { describe, expect, it } from "vitest";
import { hasContactDetails } from "@/features/auth/contact";
import { candidateSignUpSchema, contactDetailsSchema } from "@/features/auth/schemas";

const complete = { first_name: "Aïssatou", last_name: "Barry", phone: "+224 620 11 22 33", city: "Conakry", country: "Guinée" };

describe("coordonnées obligatoires pour entrer dans un espace", () => {
  it("acceptent un profil complet", () => {
    expect(hasContactDetails(complete)).toBe(true);
  });

  it("refusent un profil sans téléphone, sans ville ou sans nom", () => {
    expect(hasContactDetails({ ...complete, phone: null })).toBe(false);
    expect(hasContactDetails({ ...complete, phone: "   " })).toBe(false);
    expect(hasContactDetails({ ...complete, city: null })).toBe(false);
    expect(hasContactDetails({ ...complete, city: " " })).toBe(false);
    expect(hasContactDetails({ ...complete, first_name: "" })).toBe(false);
    expect(hasContactDetails({ ...complete, last_name: " " })).toBe(false);
  });

  it("refusent un numéro trop court pour être joignable", () => {
    expect(hasContactDetails({ ...complete, phone: "620 11" })).toBe(false);
  });

  it("le formulaire signale chaque champ manquant", () => {
    const res = contactDetailsSchema.safeParse({ first_name: "", last_name: "", phone: "", city: "", country: "Guinée" });
    expect(res.success).toBe(false);
    const fields = new Set(res.error?.issues.map((i) => i.path[0]));
    expect([...fields].sort()).toEqual(["city", "first_name", "last_name", "phone"]);
  });

  it("l'inscription candidat demande la ville", () => {
    const res = candidateSignUpSchema.safeParse({ ...complete, city: "", email: "test@example.org", password: "Candidat-E2e-2026", password_confirm: "Candidat-E2e-2026", accepted_terms: true });
    expect(res.success).toBe(false);
    expect(res.error?.issues.map((i) => i.message)).toContain("Ville requise.");
  });
});
