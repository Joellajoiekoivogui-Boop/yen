import { describe, expect, it } from "vitest";
import { candidateSignUpSchema, phoneSchema } from "@/features/auth/schemas";
import { profileSchema } from "@/features/candidates/schemas";

describe("numéro de téléphone obligatoire", () => {
  it("accepte les formats guinéens et internationaux", () => {
    for (const n of ["+224 620 00 00 00", "620000000", "00224 620-00-00-00", "+33 (0)6 12 34 56 78"]) {
      expect(phoneSchema.safeParse(n).success, n).toBe(true);
    }
  });

  it("refuse un numéro absent, trop court ou contenant des lettres", () => {
    for (const n of [undefined, null, "", "   ", "12345", "620 abc 000", "+224 620 00 00 00 00 00 00"]) {
      expect(phoneSchema.safeParse(n).success, String(n)).toBe(false);
    }
  });

  it("est exigé à l'inscription et dans le profil du candidat", () => {
    const signUp = candidateSignUpSchema.safeParse({ first_name: "A", last_name: "B", email: "a@b.test", city: "Conakry", country: "Guinée" });
    expect(signUp.success).toBe(false);
    expect(signUp.error?.issues.some((i) => i.path[0] === "phone")).toBe(true);
    const profile = profileSchema.safeParse({ first_name: "A", last_name: "B", phone: "", city: "Conakry", country: "Guinée", status: "etudiant", availability: "immediate" });
    expect(profile.error?.issues.find((i) => i.path[0] === "phone")?.message).toBe("Numéro de téléphone requis.");
  });
});
