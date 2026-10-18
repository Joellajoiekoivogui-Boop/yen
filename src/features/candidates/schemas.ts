import { z } from "zod";

/** Chaîne optionnelle : "" devient null. */
export const optText = (max: number) =>
  z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? null : v), z.string().trim().max(max, `${max} caractères maximum.`).nullable().optional());

export const reqText = (label: string, max: number) => z.string().trim().min(1, `${label} requis.`).max(max, `${max} caractères maximum.`);

export const optUrl = z.preprocess(
  (v) => (typeof v === "string" && v.trim() === "" ? null : v),
  z.url({ protocol: /^https?$/, error: "Adresse web invalide (http ou https)." }).max(500).nullable().optional(),
);

const optYear = z.preprocess((v) => (v === "" || v == null ? null : Number(v)), z.number().int().min(1970).max(2100).nullable().optional());
const optDate = z.preprocess((v) => (v === "" || v == null ? null : v), z.iso.date({ error: "Date invalide." }).nullable().optional());

export const profileSchema = z.object({
  first_name: reqText("Prénom", 100),
  last_name: reqText("Nom", 100),
  phone: z.preprocess((v) => (v === "" ? null : v), z.string().trim().max(30).regex(/^[+0-9 ()-]*$/, "Numéro invalide.").nullable().optional()),
  city: reqText("Ville", 100),
  country: reqText("Pays", 100),
  institution: optText(200),
  yen_program: optText(200),
  education_level: optText(100),
  graduation_year: optYear,
  status: z.enum(["etudiant", "diplome", "stagiaire", "en_recherche"]),
  primary_domain_id: z.preprocess((v) => (v === "" ? null : v), z.uuid().nullable().optional()),
  interest_area: optText(300),
  availability: z.enum(["immediate", "moins_1_mois", "un_a_trois_mois", "plus_tard", "indisponible"]),
  opportunity_types: z.array(z.enum(["stage", "emploi", "alternance", "mission"])).default([]),
  headline: optText(200),
  summary: optText(3000),
  linkedin_url: optUrl,
  portfolio_url: optUrl,
  github_url: optUrl,
});

export const educationSchema = z
  .object({
    institution: reqText("Établissement", 200),
    degree: reqText("Diplôme ou formation", 200),
    field_of_study: optText(200),
    start_year: optYear,
    end_year: optYear,
    is_yen_program: z.boolean().default(false),
    description: optText(2000),
  })
  .refine((v) => !v.start_year || !v.end_year || v.end_year >= v.start_year, { path: ["end_year"], message: "L'année de fin précède l'année de début." });

export const experienceSchema = z
  .object({
    title: reqText("Intitulé du poste", 200),
    organization: reqText("Organisation", 200),
    experience_type: z.enum(["stage", "emploi", "alternance", "mission", "benevolat", "projet_academique"]),
    city: optText(100),
    start_date: z.iso.date({ error: "Date de début requise." }),
    end_date: optDate,
    is_current: z.boolean().default(false),
    description: optText(4000),
    achievements: optText(4000),
    domain_id: z.preprocess((v) => (v === "" ? null : v), z.uuid().nullable().optional()),
  })
  .refine((v) => !v.end_date || v.end_date >= v.start_date, { path: ["end_date"], message: "La date de fin précède la date de début." });

export const projectSchema = z.object({
  title: reqText("Titre", 200),
  description: reqText("Description", 5000),
  role: optText(200),
  technologies: z.preprocess(
    (v) => (typeof v === "string" ? v.split(",").map((s) => s.trim()).filter(Boolean) : v),
    z.array(z.string().max(60)).max(30).default([]),
  ),
  outcomes: optText(3000),
  project_url: optUrl,
  repository_url: optUrl,
  start_date: optDate,
  end_date: optDate,
  domain_id: z.preprocess((v) => (v === "" ? null : v), z.uuid().nullable().optional()),
  skill_ids: z.array(z.uuid()).max(20).default([]),
});

export const certificationSchema = z.object({
  name: reqText("Nom de la certification", 200),
  issuer: reqText("Organisme", 200),
  issue_date: optDate,
  expiry_date: optDate,
  credential_id: optText(200),
  credential_url: optUrl,
});

export const declaredSkillSchema = z.object({
  skill_id: z.uuid({ error: "Choisissez une compétence." }),
  self_level: z.enum(["debutant", "intermediaire", "avance", "expert"]),
  years_experience: z.preprocess((v) => (v === "" || v == null ? null : Number(v)), z.number().min(0).max(60).nullable().optional()),
  evidence_note: optText(1000),
});

export const languageSchema = z.object({
  language: reqText("Langue", 60),
  proficiency: z.enum(["notions", "intermediaire", "courant", "natif"]),
});

export const consentsSchema = z.object({
  traitement_ia: z.boolean(),
  visibilite_vivier: z.boolean(),
  partage_partenaires: z.boolean(),
  notifications_externes: z.boolean(),
});

export const infoResponseSchema = z.object({ id: z.uuid(), response: reqText("Réponse", 5000) });
