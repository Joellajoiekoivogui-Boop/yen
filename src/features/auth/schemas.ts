import { z } from "zod";

export const passwordSchema = z
  .string()
  .min(10, "Au moins 10 caractères.")
  .max(128, "128 caractères maximum.")
  .regex(/[a-z]/, "Au moins une lettre minuscule.")
  .regex(/[A-Z]/, "Au moins une lettre majuscule.")
  .regex(/[0-9]/, "Au moins un chiffre.");

const name = (label: string) => z.string().trim().min(1, `${label} requis.`).max(100, "100 caractères maximum.");
const optional = (max: number) => z.string().trim().max(max, `${max} caractères maximum.`).optional().nullable();

export const signInSchema = z.object({
  email: z.email("Adresse e-mail invalide.").trim().toLowerCase(),
  password: z.string().min(1, "Mot de passe requis.").max(128),
});

export const candidateSignUpSchema = z
  .object({
    first_name: name("Prénom"),
    last_name: name("Nom"),
    email: z.email("Adresse e-mail invalide.").trim().toLowerCase(),
    phone: z.string().trim().max(30).regex(/^[+0-9 ()-]*$/, "Numéro invalide.").optional().nullable(),
    city: name("Ville"),
    country: name("Pays"),
    institution: z.string().trim().min(1, "Établissement requis.").max(200),
    yen_program: z.string().trim().min(1, "Formation YEN requise.").max(200),
    education_level: z.string().trim().min(1, "Niveau d'études requis.").max(100),
    graduation_year: z.number({ error: "Année requise." }).int().min(1970, "Année invalide.").max(2100, "Année invalide."),
    status: z.enum(["etudiant", "diplome", "stagiaire", "en_recherche"], { error: "Statut requis." }),
    primary_domain_id: z.uuid().optional().nullable(),
    interest_area: optional(300),
    availability: z.enum(["immediate", "moins_1_mois", "un_a_trois_mois", "plus_tard", "indisponible"], { error: "Disponibilité requise." }),
    opportunity_types: z.array(z.enum(["stage", "emploi", "alternance", "mission"])).min(1, "Choisissez au moins un type d'opportunité."),
    password: passwordSchema,
    password_confirm: z.string(),
    accepted_terms: z.literal(true, { error: "Vous devez accepter les conditions d'utilisation." }),
  })
  .refine((v) => v.password === v.password_confirm, { path: ["password_confirm"], message: "Les mots de passe ne correspondent pas." });

export const partnerSignUpSchema = z
  .object({
    first_name: name("Prénom"),
    last_name: name("Nom"),
    email: z.email("Adresse e-mail professionnelle invalide.").trim().toLowerCase(),
    phone: z.string().trim().max(30).regex(/^[+0-9 ()-]*$/, "Numéro invalide.").optional().nullable(),
    organization_name: z.string().trim().min(2, "Nom de l'organisation requis.").max(200),
    organization_sector: z.string().trim().min(2, "Secteur requis.").max(200),
    city: name("Ville"),
    country: name("Pays"),
    password: passwordSchema,
    password_confirm: z.string(),
    accepted_terms: z.literal(true, { error: "Vous devez accepter les conditions d'utilisation." }),
  })
  .refine((v) => v.password === v.password_confirm, { path: ["password_confirm"], message: "Les mots de passe ne correspondent pas." });

export const resetRequestSchema = z.object({ email: z.email("Adresse e-mail invalide.").trim().toLowerCase() });

export const newPasswordSchema = z
  .object({ password: passwordSchema, password_confirm: z.string() })
  .refine((v) => v.password === v.password_confirm, { path: ["password_confirm"], message: "Les mots de passe ne correspondent pas." });
