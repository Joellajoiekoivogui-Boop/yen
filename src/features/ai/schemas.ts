/**
 * Schémas des sorties structurées de l'IA. Chaque conclusion d'analyse porte
 * des `source_ids` qui doivent correspondre à une source réellement fournie au
 * modèle (CV, réponse d'évaluation, projet, évaluation humaine…).
 */
import { z } from "zod";

const nullableString = z.string().nullable();
const sourceIds = z.array(z.string()).describe("Identifiants des sources fournies justifiant cette conclusion");

export const cvExtractionSchema = z.object({
  summary: nullableString.describe("Résumé professionnel tel qu'il apparaît dans le CV, ou null"),
  education: z.array(z.object({
    institution: z.string(),
    degree: z.string(),
    field_of_study: nullableString,
    start_year: z.number().int().nullable(),
    end_year: z.number().int().nullable(),
  })),
  experiences: z.array(z.object({
    title: z.string(),
    organization: z.string(),
    experience_type: z.enum(["stage", "emploi", "alternance", "mission", "benevolat", "projet_academique"]),
    start_date: nullableString.describe("Format AAAA-MM ou null si inconnu"),
    end_date: nullableString.describe("Format AAAA-MM, null si en cours ou inconnu"),
    is_current: z.boolean(),
    description: nullableString,
    achievements: nullableString,
  })),
  skills: z.array(z.object({
    name: z.string(),
    evidence_quote: z.string().describe("Extrait exact du CV mentionnant cette compétence"),
  })),
  tools: z.array(z.string()),
  certifications: z.array(z.object({ name: z.string(), issuer: nullableString, issue_date: nullableString })),
  projects: z.array(z.object({ title: z.string(), description: z.string(), technologies: z.array(z.string()) })),
  languages: z.array(z.object({ language: z.string(), proficiency: z.enum(["notions", "intermediaire", "courant", "natif"]) })),
  measurable_achievements: z.array(z.string()),
  warnings: z.array(z.string()).describe("Problèmes de lecture, sections illisibles, informations ambiguës"),
});
export type CvExtraction = z.infer<typeof cvExtractionSchema>;

export const profileAnalysisSchema = z.object({
  declared_skills: z.array(z.object({ skill: z.string(), source_ids: sourceIds })),
  demonstrated_skills: z.array(z.object({ skill: z.string(), level: z.enum(["debutant", "intermediaire", "avance", "expert"]), source_ids: sourceIds })),
  strengths: z.array(z.object({ text: z.string(), source_ids: sourceIds })),
  skills_to_confirm: z.array(z.object({ skill: z.string(), reason: z.string(), source_ids: sourceIds })),
  gaps: z.array(z.object({ text: z.string(), source_ids: sourceIds })),
  compatible_occupations: z.array(z.object({ occupation_slug: z.string(), rationale: z.string(), source_ids: sourceIds })),
  transferable_skills: z.array(z.object({ text: z.string(), source_ids: sourceIds })),
  training_recommendations: z.array(z.object({ title: z.string(), detail: z.string(), source_ids: sourceIds })),
  confidence: z.enum(["faible", "moyenne", "elevee"]),
  insufficient_data: z.boolean(),
  insufficient_data_notes: z.array(z.string()),
});
export type ProfileAnalysis = z.infer<typeof profileAnalysisSchema>;

export const cvImprovementSchema = z.object({
  suggestions: z.array(z.object({
    section: z.string(),
    issue: z.string(),
    suggestion: z.string(),
    source_ids: sourceIds,
  })),
  improved_headline: nullableString,
  improved_summary: nullableString.describe("Résumé réécrit UNIQUEMENT à partir des faits fournis"),
  improved_experiences: z.array(z.object({ experience_id: z.string(), rewritten_description: z.string(), source_ids: sourceIds })),
  missing_information: z.array(z.string()).describe("Informations à demander au candidat plutôt que de les inventer"),
});
export type CvImprovement = z.infer<typeof cvImprovementSchema>;

export const progressPlanSchema = z.object({
  horizon_weeks: z.number().int(),
  steps: z.array(z.object({
    period: z.string().describe("Ex. « Semaines 1-2 »"),
    objective: z.string(),
    actions: z.array(z.string()),
    skill_slug: nullableString,
    project_idea: nullableString,
    source_ids: sourceIds,
  })),
  notes: z.array(z.string()),
});
export type ProgressPlan = z.infer<typeof progressPlanSchema>;

export const managerSummarySchema = z.object({
  summary: z.string(),
  key_evidence: z.array(z.object({ text: z.string(), source_ids: sourceIds })),
  points_to_verify: z.array(z.object({ text: z.string(), source_ids: sourceIds })),
  suggested_next_steps: z.array(z.string()),
  insufficient_data: z.boolean(),
});
export type ManagerSummary = z.infer<typeof managerSummarySchema>;

export const answerGradingSchema = z.object({
  criteria: z.array(z.object({
    criterion: z.string(),
    points_awarded: z.number(),
    max_points: z.number(),
    justification: z.string(),
  })),
  total_points: z.number(),
  feedback: z.string(),
  confidence: z.enum(["faible", "moyenne", "elevee"]),
});
export type AnswerGrading = z.infer<typeof answerGradingSchema>;
