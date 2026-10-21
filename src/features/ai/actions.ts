"use server";

import { revalidatePath } from "next/cache";
import { z } from "@/lib/zod";
import { dbErrorMessage, fail, logAudit, parseInput, rateLimit, runAction, type ActionResult } from "@/lib/action";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { isUuid } from "@/lib/utils";
import { notifyCandidate } from "@/features/notifications/service";
import { refreshPipelineStatus } from "@/features/candidates/pipeline";
import { AINotConfiguredError, isAIConfigured } from "./provider";
import type { CvExtraction } from "./schemas";
import {
  analyzeProfile, assistantReply, ConsentRequiredError, extractCv, improveCv, managerSummary, normalizeExtractedSkills, progressPlan, suggestAnswerGrade,
  type AnalysisRecord,
} from "./services";

const NOT_CONFIGURED_MSG = "Le service d'IA n'est pas configuré sur cette plateforme. Les autres fonctionnalités restent disponibles ; contactez l'administrateur YEN.";

async function guardAI<T>(fn: () => Promise<T>): Promise<{ ok: true; value: T } | { ok: false; error: string }> {
  if (!isAIConfigured()) return { ok: false, error: NOT_CONFIGURED_MSG };
  try {
    return { ok: true, value: await fn() };
  } catch (e) {
    if (e instanceof AINotConfiguredError) return { ok: false, error: NOT_CONFIGURED_MSG };
    if (e instanceof ConsentRequiredError) return { ok: false, error: e.message };
    if (e instanceof Error && /introuvable/.test(e.message)) return { ok: false, error: e.message };
    if (e instanceof Error && e.message.includes("SUPABASE_SECRET_KEY")) {
      return { ok: false, error: "Les fonctions d'IA nécessitent aussi la clé SUPABASE_SECRET_KEY dans la configuration du serveur. Prévenez l'administrateur de la plateforme." };
    }
    console.error("[ai] échec", e instanceof Error ? e.message : e);
    return { ok: false, error: "Le service d'IA a rencontré une erreur. Réessayez plus tard." };
  }
}

function resultFrom(rec: AnalysisRecord, okMsg: string): ActionResult<{ analysisId: string }> {
  if (rec.status === "echoue") return fail(`Analyse échouée : ${rec.error ?? "erreur inconnue"}. L'échec a été enregistré.`);
  return { ok: true, message: rec.status === "partiel" ? `${okMsg} Certaines conclusions non justifiées par une source ont été écartées.` : okMsg, data: { analysisId: rec.id } };
}

/* ----------------------------- Candidat ---------------------------------- */

export async function runCvExtractionAction(documentId: string): Promise<ActionResult<{ analysisId: string }>> {
  return runAction<{ analysisId: string }>({ requireCandidate: true }, async (ctx) => {
    if (!isUuid(documentId)) return fail("Document invalide.");
    if (!(await rateLimit(`ai:cv:${ctx.userId}`))) return fail("Limite d'extractions atteinte pour l'heure en cours.");
    const r = await guardAI(() => extractCv(ctx.candidateId!, documentId, ctx.userId));
    if (!r.ok) return fail(r.error);
    revalidatePath("/candidat/cv");
    return resultFrom(r.value, "Extraction terminée : vérifiez les informations proposées avant de les ajouter à votre profil.");
  });
}

const applySchema = z.object({
  analysisId: z.guid(),
  summary: z.boolean().default(false),
  education: z.array(z.number().int().min(0)).default([]),
  experiences: z.array(z.number().int().min(0)).default([]),
  skills: z.array(z.number().int().min(0)).default([]),
  certifications: z.array(z.number().int().min(0)).default([]),
  projects: z.array(z.number().int().min(0)).default([]),
  languages: z.array(z.number().int().min(0)).default([]),
});

const ym = (v: string | null) => (v && /^\d{4}-\d{2}$/.test(v) ? `${v}-01` : v && /^\d{4}$/.test(v) ? `${v}-01-01` : null);

/** Le candidat valide les éléments extraits : seuls les éléments cochés sont ajoutés au profil. */
export async function applyCvExtractionAction(values: Record<string, unknown>): Promise<ActionResult> {
  return runAction({ requireCandidate: true }, async (ctx) => {
    const v = parseInput(applySchema, values);
    const supabase = await createClient();
    const { data: analysis } = await supabase
      .from("ai_analyses")
      .select("id, output, kind, candidate_id, status")
      .eq("id", v.analysisId)
      .eq("candidate_id", ctx.candidateId!)
      .eq("kind", "extraction_cv")
      .maybeSingle();
    if (!analysis || analysis.status === "echoue" || !analysis.output) return fail("Extraction introuvable.");
    const out = analysis.output as CvExtraction;
    const cid = ctx.candidateId!;
    const src = "extraction_cv_validee";
    const pick = <T,>(arr: T[], idx: number[]) => idx.filter((i) => i < arr.length).map((i) => arr[i]);
    const errors: string[] = [];

    if (v.summary && out.summary) {
      const r = await supabase.from("candidate_profiles").update({ summary: out.summary.slice(0, 3000) }).eq("id", cid);
      if (r.error) errors.push("résumé");
    }
    const edu = pick(out.education, v.education).map((e) => ({
      candidate_id: cid, institution: e.institution.slice(0, 200), degree: e.degree.slice(0, 200), field_of_study: e.field_of_study?.slice(0, 200) ?? null,
      start_year: e.start_year && e.start_year >= 1970 && e.start_year <= 2100 ? e.start_year : null,
      end_year: e.end_year && e.end_year >= 1970 && e.end_year <= 2100 && (!e.start_year || e.end_year >= e.start_year) ? e.end_year : null, source: src,
    }));
    if (edu.length && (await supabase.from("candidate_education").insert(edu)).error) errors.push("formations");

    const exps = pick(out.experiences, v.experiences)
      .map((e) => ({
        candidate_id: cid, title: e.title.slice(0, 200), organization: e.organization.slice(0, 200), experience_type: e.experience_type,
        start_date: ym(e.start_date), end_date: e.is_current ? null : ym(e.end_date), is_current: e.is_current,
        description: e.description?.slice(0, 4000) ?? null, achievements: e.achievements?.slice(0, 4000) ?? null, source: src,
      }))
      .filter((e) => e.start_date);
    if (exps.length < v.experiences.length) errors.push("expériences sans date de début (à saisir manuellement)");
    if (exps.length && (await supabase.from("candidate_experiences").insert(exps.map((e) => ({ ...e, end_date: e.end_date && e.end_date < e.start_date! ? null : e.end_date })))).error) errors.push("expériences");

    const certs = pick(out.certifications, v.certifications).map((c) => ({ candidate_id: cid, name: c.name.slice(0, 200), issuer: (c.issuer ?? "Non précisé").slice(0, 200), issue_date: ym(c.issue_date), training_period: ym(c.issue_date)?.slice(0, 4) ?? null, source: src }));
    if (certs.length && (await supabase.from("candidate_certifications").insert(certs)).error) errors.push("certifications");

    const projs = pick(out.projects, v.projects).map((p) => ({ candidate_id: cid, title: p.title.slice(0, 200), description: p.description.slice(0, 5000), technologies: p.technologies.slice(0, 30).map((t) => t.slice(0, 60)), source: src }));
    if (projs.length && (await supabase.from("candidate_projects").insert(projs)).error) errors.push("projets");

    const langs = pick(out.languages, v.languages).map((l) => ({ candidate_id: cid, language: l.language.slice(0, 60), proficiency: l.proficiency, source: src }));
    if (langs.length && (await supabase.from("candidate_languages").upsert(langs, { onConflict: "candidate_id,language" })).error) errors.push("langues");

    // Compétences : rattachées au catalogue ; enregistrées comme DÉCLARÉES (jamais démontrées)
    const chosen = pick(out.skills, v.skills).map((s) => s.name);
    const normalized = await normalizeExtractedSkills(chosen);
    const known = normalized.filter((n) => n.skillId);
    if (known.length) {
      const rows = [...new Map(known.map((k) => [k.skillId, k])).values()].map((k) => ({ candidate_id: cid, skill_id: k.skillId, self_level: "debutant", source: src, evidence_note: `Mentionnée dans le CV : « ${k.label} »` }));
      const r = await supabase.from("candidate_skills").upsert(rows, { onConflict: "candidate_id,skill_id", ignoreDuplicates: true });
      if (r.error) errors.push("compétences");
    }
    const unknown = normalized.filter((n) => !n.skillId).map((n) => n.label);

    await createAdminClient().from("ai_analyses").update({ validation_status: "valide", validated_by: ctx.userId, validated_at: new Date().toISOString(), correction_note: "Éléments sélectionnés et validés par le candidat" }).eq("id", analysis.id);
    await refreshPipelineStatus(cid);
    revalidatePath("/candidat", "layout");
    const parts = [`Éléments ajoutés à votre profil.`];
    if (known.length) parts.push(`${known.length} compétence(s) ajoutée(s) comme « déclarées » : passez une évaluation pour les démontrer.`);
    if (unknown.length) parts.push(`Non reconnues dans le catalogue : ${unknown.join(", ")}.`);
    if (errors.length) parts.push(`Points à vérifier : ${errors.join(", ")}.`);
    return { ok: true, message: parts.join(" ") };
  });
}

export async function analyzeMyProfileAction(): Promise<ActionResult<{ analysisId: string }>> {
  return runAction<{ analysisId: string }>({ requireCandidate: true }, async (ctx) => {
    if (!(await rateLimit(`ai:profile:${ctx.userId}`))) return fail("Limite d'analyses atteinte pour l'heure en cours.");
    const r = await guardAI(() => analyzeProfile(ctx.candidateId!, ctx.userId));
    if (!r.ok) return fail(r.error);
    revalidatePath("/candidat", "layout");
    return resultFrom(r.value, "Analyse de votre profil terminée.");
  });
}

export async function improveMyCvAction(): Promise<ActionResult<{ analysisId: string }>> {
  return runAction<{ analysisId: string }>({ requireCandidate: true }, async (ctx) => {
    if (!(await rateLimit(`ai:cvimp:${ctx.userId}`))) return fail("Limite atteinte pour l'heure en cours.");
    const r = await guardAI(() => improveCv(ctx.candidateId!, ctx.userId));
    if (!r.ok) return fail(r.error);
    revalidatePath("/candidat/cv");
    return resultFrom(r.value, "Suggestions générées.");
  });
}

const applySuggestionSchema = z.discriminatedUnion("target", [
  z.object({ target: z.literal("summary"), analysisId: z.guid() }),
  z.object({ target: z.literal("headline"), analysisId: z.guid() }),
  z.object({ target: z.literal("experience"), analysisId: z.guid(), experienceId: z.guid() }),
]);

/** Applique une reformulation proposée (le candidat décide ; le texte vient de l'analyse enregistrée). */
export async function applyCvSuggestionAction(values: Record<string, unknown>): Promise<ActionResult> {
  return runAction({ requireCandidate: true }, async (ctx) => {
    const v = parseInput(applySuggestionSchema, values);
    const supabase = await createClient();
    const { data: a } = await supabase.from("ai_analyses").select("output").eq("id", v.analysisId).eq("candidate_id", ctx.candidateId!).eq("kind", "amelioration_cv").maybeSingle();
    const out = a?.output as { improved_summary: string | null; improved_headline: string | null; improved_experiences: { experience_id: string; rewritten_description: string }[] } | undefined;
    if (!out) return fail("Suggestion introuvable.");
    let res;
    if (v.target === "summary" && out.improved_summary) res = await supabase.from("candidate_profiles").update({ summary: out.improved_summary.slice(0, 3000) }).eq("id", ctx.candidateId!);
    else if (v.target === "headline" && out.improved_headline) res = await supabase.from("candidate_profiles").update({ headline: out.improved_headline.slice(0, 200) }).eq("id", ctx.candidateId!);
    else if (v.target === "experience") {
      const e = out.improved_experiences.find((x) => x.experience_id === v.experienceId);
      if (!e) return fail("Suggestion introuvable.");
      res = await supabase.from("candidate_experiences").update({ description: e.rewritten_description.slice(0, 4000) }).eq("id", v.experienceId).eq("candidate_id", ctx.candidateId!);
    } else return fail("Suggestion vide.");
    if (res.error) return fail(dbErrorMessage(res.error));
    revalidatePath("/candidat", "layout");
    return { ok: true, message: "Reformulation appliquée à votre profil." };
  });
}

export async function generateProgressPlanAction(): Promise<ActionResult<{ analysisId: string }>> {
  return runAction<{ analysisId: string }>({ requireCandidate: true }, async (ctx) => {
    if (!(await rateLimit(`ai:plan:${ctx.userId}`))) return fail("Limite atteinte pour l'heure en cours.");
    const r = await guardAI(() => progressPlan(ctx.candidateId!, ctx.userId));
    if (!r.ok) return fail(r.error);
    revalidatePath("/candidat/progression");
    return resultFrom(r.value, "Plan de progression généré.");
  });
}

const chatSchema = z.object({
  messages: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().trim().min(1).max(4000) })).min(1).max(30),
});

export async function assistantAction(values: Record<string, unknown>): Promise<ActionResult<{ reply: string }>> {
  return runAction<{ reply: string }>({ requireCandidate: true }, async (ctx) => {
    const v = parseInput(chatSchema, values);
    if (v.messages[v.messages.length - 1].role !== "user") return fail("Message invalide.");
    if (!(await rateLimit(`ai:chat:${ctx.userId}`))) return fail("Vous avez atteint la limite de messages pour l'heure en cours.");
    const r = await guardAI(() => assistantReply(ctx.candidateId!, v.messages));
    if (!r.ok) return fail(r.error);
    return { ok: true, data: { reply: r.value } };
  });
}

/* ----------------------------- Personnel --------------------------------- */

export async function staffAnalyzeProfileAction(candidateId: string): Promise<ActionResult<{ analysisId: string }>> {
  return runAction<{ analysisId: string }>({ permission: "ai.run" }, async (ctx) => {
    if (!isUuid(candidateId)) return fail("Candidat invalide.");
    const r = await guardAI(() => analyzeProfile(candidateId, ctx.userId));
    if (!r.ok) return fail(r.error);
    await notifyCandidate(candidateId, { category: "recommandation", title: "Nouvelle analyse de votre profil", body: "Des recommandations sont disponibles dans votre espace.", link: "/candidat/metiers" });
    revalidatePath(`/admin/talents/${candidateId}`);
    return resultFrom(r.value, "Analyse enregistrée.");
  });
}

export async function staffManagerSummaryAction(candidateId: string, offerId?: string): Promise<ActionResult<{ analysisId: string }>> {
  return runAction<{ analysisId: string }>({ permission: "ai.run" }, async (ctx) => {
    if (!isUuid(candidateId) || (offerId && !isUuid(offerId))) return fail("Paramètres invalides.");
    const r = await guardAI(() => managerSummary(candidateId, ctx.userId, offerId));
    if (!r.ok) return fail(r.error);
    revalidatePath(`/admin/talents/${candidateId}`);
    return resultFrom(r.value, "Synthèse générée (usage interne).");
  });
}

const reviewSchema = z.object({
  analysisId: z.guid(),
  validation_status: z.enum(["valide", "corrige", "conteste", "rejete"]),
  correction_note: z.string().trim().max(3000).optional().nullable(),
  correction: z.string().trim().max(20000).optional().nullable(),
});

/** Validation humaine, correction ou contestation d'une analyse IA. */
export async function reviewAnalysisAction(values: Record<string, unknown>): Promise<ActionResult> {
  return runAction({ permission: "ai.review" }, async (ctx) => {
    const v = parseInput(reviewSchema, values);
    let correction: unknown = null;
    if (v.correction) {
      try {
        correction = JSON.parse(v.correction);
      } catch {
        correction = { texte: v.correction };
      }
    }
    if ((v.validation_status === "corrige" || v.validation_status === "conteste") && !v.correction_note && !v.correction) {
      return fail("Indiquez le motif ou la correction.");
    }
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("ai_analyses")
      .update({ validation_status: v.validation_status, correction_note: v.correction_note ?? null, correction, validated_by: ctx.userId, validated_at: new Date().toISOString() })
      .eq("id", v.analysisId)
      .select("candidate_id")
      .single();
    if (error) return fail(dbErrorMessage(error));
    if (v.validation_status === "rejete" || v.validation_status === "conteste") {
      // Les recommandations issues d'une analyse rejetée ou contestée sont retirées de l'espace candidat
      await supabase.from("ai_recommendations").update({ status: "ignoree" }).eq("analysis_id", v.analysisId).eq("status", "active");
    }
    revalidatePath(`/admin/talents/${data?.candidate_id}`);
    return { ok: true, message: "Revue enregistrée." };
  });
}

/** Recalcule une analyse (nouvelle exécution traçable, l'ancienne est marquée remplacée). */
export async function recomputeAnalysisAction(analysisId: string): Promise<ActionResult<{ analysisId: string }>> {
  return runAction<{ analysisId: string }>({ permission: "ai.run" }, async (ctx) => {
    if (!isUuid(analysisId)) return fail("Analyse invalide.");
    const admin = createAdminClient();
    const { data: old } = await admin.from("ai_analyses").select("id, kind, candidate_id, document_id, offer_id").eq("id", analysisId).maybeSingle();
    if (!old?.candidate_id) return fail("Analyse introuvable.");
    const run = (): Promise<AnalysisRecord> => {
      switch (old.kind) {
        case "analyse_profil": return analyzeProfile(old.candidate_id, ctx.userId);
        case "amelioration_cv": return improveCv(old.candidate_id, ctx.userId);
        case "plan_progression": return progressPlan(old.candidate_id, ctx.userId);
        case "synthese_responsable": return managerSummary(old.candidate_id, ctx.userId);
        case "resume_rapprochement": return managerSummary(old.candidate_id, ctx.userId, old.offer_id ?? undefined);
        case "extraction_cv":
          if (!old.document_id) throw new Error("Document introuvable.");
          return extractCv(old.candidate_id, old.document_id, ctx.userId);
        default: throw new Error("Type d'analyse non recalculable introuvable.");
      }
    };
    const r = await guardAI(run);
    if (!r.ok) return fail(r.error);
    await admin.from("ai_analyses").update({ superseded_by: r.value.id }).eq("id", old.id);
    await logAudit(ctx.userId, "ai_recomputed", "ai_analyses", old.id, { new_id: r.value.id });
    revalidatePath(`/admin/talents/${old.candidate_id}`);
    return resultFrom(r.value, "Analyse recalculée.");
  });
}

export async function suggestGradeAction(answerId: string): Promise<ActionResult> {
  return runAction({ permission: "assessments.review" }, async (ctx) => {
    if (!isUuid(answerId)) return fail("Réponse invalide.");
    const r = await guardAI(() => suggestAnswerGrade(answerId, ctx.userId));
    if (!r.ok) return fail(r.error);
    revalidatePath("/admin/corrections");
    return r.value.status === "echoue" ? fail(`Proposition impossible : ${r.value.error}`) : { ok: true, message: "Proposition de note générée : elle doit être validée par vous." };
  });
}
