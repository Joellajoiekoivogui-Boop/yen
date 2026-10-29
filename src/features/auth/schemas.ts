import { z } from "@/lib/zod";
import { suggestEmailFix } from "./email-typos";
import { isCommonPassword, MIN_PASSWORD_LENGTH } from "./password-rules";

export const passwordSchema = z
  .string()
  .min(MIN_PASSWORD_LENGTH, `Au moins ${MIN_PASSWORD_LENGTH} caractères.`)
  .max(128, "128 caractères maximum.")
  .refine((v) => !isCommonPassword(v), "Ce mot de passe est trop courant : choisissez-en un autre.");

/** Numéro de téléphone obligatoire (candidats) : 8 à 15 chiffres, indicatif compris. */
export const phoneSchema = z
  .string({ error: "Numéro de téléphone requis." })
  .trim()
  .min(1, "Numéro de téléphone requis.")
  .max(30, "30 caractères maximum.")
  .regex(/^[+0-9 ().-]+$/, "Numéro invalide : chiffres, espaces et « + » uniquement.")
  .refine((v) => /^\d{8,15}$/.test(v.replace(/\D/g, "")), "Numéro invalide : 8 à 15 chiffres, indicatif compris (ex. +224 620 00 00 00).");

/** Ville de résidence, exigée avec le téléphone pour pouvoir entrer dans un espace. */
export const citySchema = z.string({ error: "Ville requise." }).trim().min(1, "Ville requise.").max(100, "100 caractères maximum.");

/** Adresse d'inscription : une faute de frappe connue dans le domaine (gmail.co…) est refusée avec la correction proposée. */
const signUpEmail = (message: string) =>
  z
    .email(message)
    .trim()
    .toLowerCase()
    .refine((v) => !suggestEmailFix(v), { error: (iss) => `Adresse probablement mal écrite : vouliez-vous dire ${suggestEmailFix(String(iss.input))} ?` });

const name = (label: string) => z.string().trim().min(1, `${label} requis.`).max(100, "100 caractères maximum.");

export const signInSchema = z.object({
  email: z.email("Adresse e-mail invalide.").trim().toLowerCase(),
  password: z.string().min(1, "Mot de passe requis.").max(128),
});

/**
 * Inscription candidat volontairement courte : identité, coordonnées (téléphone, ville), e-mail et mot de passe.
 * Le parcours (établissement, formation YEN, domaine…) se complète ensuite dans « Mon profil ».
 */
export const candidateSignUpSchema = z
  .object({
    first_name: name("Prénom"),
    last_name: name("Nom"),
    email: signUpEmail("Adresse e-mail invalide."),
    phone: phoneSchema,
    city: citySchema,
    password: passwordSchema,
    password_confirm: z.string(),
    accepted_terms: z.literal(true, { error: "Vous devez accepter les conditions d'utilisation." }),
  })
  .refine((v) => v.password === v.password_confirm, { path: ["password_confirm"], message: "Les deux mots de passe ne sont pas identiques." });

/** Coordonnées obligatoires pour entrer dans l'espace candidat ou dans l'administration. */
export const contactDetailsSchema = z.object({
  first_name: name("Prénom"),
  last_name: name("Nom"),
  phone: phoneSchema,
  city: citySchema,
  country: z.string().trim().min(1, "Pays requis.").max(100, "100 caractères maximum."),
});

export const partnerSignUpSchema = z
  .object({
    organization_name: z.string().trim().min(2, "Nom de l'organisation requis.").max(200),
    first_name: name("Prénom"),
    last_name: name("Nom"),
    email: signUpEmail("Adresse e-mail professionnelle invalide."),
    phone: z.string().trim().max(30).regex(/^[+0-9 ()-]*$/, "Numéro invalide.").optional().nullable(),
    password: passwordSchema,
    password_confirm: z.string(),
    accepted_terms: z.literal(true, { error: "Vous devez accepter les conditions d'utilisation." }),
  })
  .refine((v) => v.password === v.password_confirm, { path: ["password_confirm"], message: "Les deux mots de passe ne sont pas identiques." });

export const resetRequestSchema = z.object({ email: z.email("Adresse e-mail invalide.").trim().toLowerCase() });

export const newPasswordSchema = z
  .object({ password: passwordSchema, password_confirm: z.string() })
  .refine((v) => v.password === v.password_confirm, { path: ["password_confirm"], message: "Les deux mots de passe ne sont pas identiques." });

/** Changement de mot de passe depuis les paramètres du compte : le mot de passe actuel est exigé. */
export const changePasswordSchema = z
  .object({ current_password: z.string().min(1, "Mot de passe actuel requis.").max(128), password: passwordSchema, password_confirm: z.string() })
  .refine((v) => v.password === v.password_confirm, { path: ["password_confirm"], message: "Les deux mots de passe ne sont pas identiques." });
