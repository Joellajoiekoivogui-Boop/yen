import { z } from "zod";

const weight = z.preprocess((v) => (v === "" || v == null ? null : Number(v)), z.number().min(0).max(100).nullable().optional());

export const offerSchema = z
  .object({
    organization_id: z.uuid({ error: "Organisation requise." }),
    title: z.string().trim().min(3, "Titre requis.").max(200),
    description: z.string().trim().min(20, "Description trop courte (20 caractères minimum).").max(10000),
    offer_type: z.enum(["stage", "emploi", "alternance", "mission"]),
    domain_id: z.preprocess((v) => (v === "" ? null : v), z.uuid().nullable().optional()),
    occupation_id: z.preprocess((v) => (v === "" ? null : v), z.uuid().nullable().optional()),
    education_level: z.preprocess((v) => (v === "" ? null : v), z.string().trim().max(100).nullable().optional()),
    min_experience_months: z.preprocess((v) => (v === "" || v == null ? 0 : Number(v)), z.number().int().min(0).max(600)),
    location: z.string().trim().min(2, "Lieu requis.").max(200),
    remote_policy: z.enum(["sur_site", "hybride", "distance"]),
    deadline: z.preprocess((v) => (v === "" ? null : v), z.iso.date().nullable().optional()),
    positions: z.number({ error: "Nombre de places requis." }).int().min(1).max(1000),
    special_conditions: z.preprocess((v) => (v === "" ? null : v), z.string().trim().max(3000).nullable().optional()),
    skills: z
      .array(z.object({ skill_id: z.uuid(), required_level: z.enum(["debutant", "intermediaire", "avance", "expert"]), is_mandatory: z.boolean() }))
      .max(30)
      .default([]),
    w_demonstrated_skills: weight,
    w_assessments: weight,
    w_projects: weight,
    w_education: weight,
    w_experience: weight,
  })
  .refine(
    (v) => {
      const ws = [v.w_demonstrated_skills, v.w_assessments, v.w_projects, v.w_education, v.w_experience];
      const filled = ws.filter((w) => w != null);
      return filled.length === 0 || (filled.length === 5 && Math.abs(filled.reduce((a, b) => a! + b!, 0)! - 100) < 0.01);
    },
    { path: ["w_experience"], message: "Renseignez les 5 pondérations (somme = 100) ou laissez-les toutes vides." },
  );

export type OfferInput = z.infer<typeof offerSchema>;

export function weightsFromInput(v: OfferInput) {
  if (v.w_demonstrated_skills == null) return null;
  return {
    demonstrated_skills: v.w_demonstrated_skills,
    assessments: v.w_assessments ?? 0,
    projects: v.w_projects ?? 0,
    education: v.w_education ?? 0,
    experience: v.w_experience ?? 0,
  };
}
