"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { dbErrorMessage, fail, logAudit, parseInput, runAction, type ActionResult } from "@/lib/action";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { isUuid } from "@/lib/utils";
import { notifyCandidate, notifyStaffWithPermission } from "@/features/notifications/service";
import { gradeAttempt } from "./grading";
import { finalizeAttempt, loadGradableQuestions } from "./service";

const GRACE_MS = 5 * 60 * 1000;

/** Démarre (ou reprend) une tentative. Les tentatives sont créées côté serveur uniquement. */
export async function startAttemptAction(assessmentId: string): Promise<ActionResult<{ attemptId: string }>> {
  return runAction<{ attemptId: string }>({ requireCandidate: true }, async (ctx) => {
    if (!isUuid(assessmentId)) return fail("Évaluation invalide.");
    const supabase = await createClient();
    const { data: a } = await supabase.from("assessments").select("id, version, duration_minutes, max_attempts, cooldown_hours, status").eq("id", assessmentId).eq("status", "publie").maybeSingle();
    if (!a) return fail("Cette évaluation n'est pas disponible.");
    const { data: attempts } = await supabase
      .from("assessment_attempts")
      .select("id, status, deadline_at, submitted_at, started_at")
      .eq("assessment_id", a.id)
      .eq("candidate_id", ctx.candidateId!)
      .order("started_at", { ascending: false });
    const open = (attempts ?? []).find((t) => t.status === "en_cours" && new Date(t.deadline_at).getTime() + GRACE_MS > Date.now());
    if (open) return { ok: true, data: { attemptId: open.id } };
    const done = (attempts ?? []).filter((t) => t.status !== "annule");
    if (a.max_attempts && done.length >= a.max_attempts) return fail(`Nombre maximal de tentatives atteint (${a.max_attempts}).`);
    const last = done.find((t) => t.submitted_at);
    if (last && a.cooldown_hours > 0) {
      const next = new Date(last.submitted_at!).getTime() + a.cooldown_hours * 3600_000;
      if (next > Date.now()) return fail(`Vous pourrez repasser cette évaluation à partir du ${new Date(next).toLocaleString("fr-FR", { timeZone: "Africa/Conakry" })}.`);
    }
    const admin = createAdminClient();
    const { data: created, error } = await admin
      .from("assessment_attempts")
      .insert({
        assessment_id: a.id,
        assessment_version: a.version,
        candidate_id: ctx.candidateId,
        deadline_at: new Date(Date.now() + a.duration_minutes * 60_000).toISOString(),
      })
      .select("id")
      .single();
    if (error || !created) return fail("La tentative n'a pas pu démarrer.");
    return { ok: true, data: { attemptId: created.id } };
  });
}

const submitSchema = z.object({
  attemptId: z.guid(),
  answers: z.array(z.object({
    questionId: z.guid(),
    selectedOptionIds: z.array(z.guid()).max(20).default([]),
    textAnswer: z.string().max(10000).nullable().optional(),
  })).max(200),
});

/** Soumission : correction automatique côté serveur ; les réponses libres partent en correction humaine. */
export async function submitAttemptAction(values: Record<string, unknown>): Promise<ActionResult<{ status: string }>> {
  return runAction<{ status: string }>({ requireCandidate: true }, async (ctx) => {
    const v = parseInput(submitSchema, values);
    const supabase = await createClient();
    const { data: attempt } = await supabase
      .from("assessment_attempts")
      .select("id, assessment_id, status, deadline_at, candidate_id, assessments(title)")
      .eq("id", v.attemptId)
      .eq("candidate_id", ctx.candidateId!)
      .maybeSingle();
    if (!attempt) return fail("Tentative introuvable.");
    if (attempt.status !== "en_cours") return fail("Cette tentative a déjà été soumise.");
    const admin = createAdminClient();
    if (new Date(attempt.deadline_at).getTime() + GRACE_MS < Date.now()) {
      await admin.from("assessment_attempts").update({ status: "expire", submitted_at: new Date().toISOString() }).eq("id", attempt.id);
      return fail("Le temps imparti est dépassé : la tentative a expiré.");
    }

    const questions = await loadGradableQuestions(admin, attempt.assessment_id);
    const qIds = new Set(questions.map((q) => q.id));
    const answers = v.answers.filter((a) => qIds.has(a.questionId)).map((a) => ({ questionId: a.questionId, selectedOptionIds: a.selectedOptionIds, textAnswer: a.textAnswer?.trim() || null }));
    const grade = gradeAttempt(questions, answers);

    const rows = questions.map((q) => {
      const a = answers.find((x) => x.questionId === q.id);
      const g = grade.grades.find((x) => x.questionId === q.id)!;
      return { attempt_id: attempt.id, question_id: q.id, selected_option_ids: a?.selectedOptionIds ?? [], text_answer: a?.textAnswer ?? null, auto_points: g.points };
    });
    const ins = await admin.from("assessment_answers").upsert(rows, { onConflict: "attempt_id,question_id" });
    if (ins.error) return fail("Vos réponses n'ont pas pu être enregistrées.");

    await admin.from("assessment_attempts").update({
      status: grade.needsReview ? "en_correction" : "en_cours",
      submitted_at: new Date().toISOString(),
      needs_human_review: grade.needsReview,
      max_points: grade.maxPoints,
    }).eq("id", attempt.id);

    if (grade.needsReview) {
      await notifyStaffWithPermission("assessments.review", {
        category: "evaluation",
        title: "Nouvelle correction à effectuer",
        body: `Une tentative de « ${(attempt.assessments as unknown as { title: string }).title} » attend une correction humaine.`,
        link: `/admin/corrections/${attempt.id}`,
      });
      revalidatePath("/candidat/evaluations");
      return { ok: true, message: "Réponses envoyées. Certaines questions seront corrigées par un évaluateur YEN : vous serez notifié du résultat.", data: { status: "en_correction" } };
    }
    await finalizeAttempt(attempt.id, null);
    revalidatePath("/candidat", "layout");
    return { ok: true, message: "Évaluation corrigée.", data: { status: "corrige" } };
  });
}

/* ----------------------------- Correction humaine ------------------------ */

const reviewSchema = z.object({
  attemptId: z.guid(),
  grades: z.array(z.object({ answerId: z.guid(), points: z.number().min(0), comment: z.string().max(2000).optional().nullable() })),
  comment: z.string().max(3000).optional().nullable(),
});

export async function reviewAttemptAction(values: Record<string, unknown>): Promise<ActionResult> {
  return runAction({ permission: "assessments.review" }, async (ctx) => {
    const v = parseInput(reviewSchema, values);
    const supabase = await createClient();
    const { data: attempt } = await supabase.from("assessment_attempts").select("id, status, candidate_id").eq("id", v.attemptId).maybeSingle();
    if (!attempt) return fail("Tentative introuvable.");
    if (attempt.status !== "en_correction") return fail("Cette tentative n'est pas en attente de correction.");
    const { data: answers } = await supabase.from("assessment_answers").select("id, question_id, assessment_questions(points)").eq("attempt_id", attempt.id);
    for (const g of v.grades) {
      const a = answers?.find((x) => x.id === g.answerId);
      if (!a) return fail("Réponse inconnue.");
      const max = Number((a.assessment_questions as unknown as { points: number }).points);
      if (g.points > max) return fail(`Une note dépasse le maximum de la question (${max}).`);
      const r = await supabase.from("assessment_answers").update({ manual_points: g.points, reviewer_comment: g.comment ?? null, graded_by: ctx.userId }).eq("id", g.answerId);
      if (r.error) return fail(dbErrorMessage(r.error));
    }
    try {
      await finalizeAttempt(attempt.id, ctx.userId, v.comment);
    } catch (e) {
      return fail(e instanceof Error && e.message === "Correction incomplète" ? "Toutes les questions à correction humaine doivent être notées." : "La correction n'a pas pu être finalisée.");
    }
    await logAudit(ctx.userId, "attempt_reviewed", "assessment_attempts", attempt.id);
    revalidatePath("/admin/corrections");
    return { ok: true, message: "Correction validée. Le candidat a été notifié." };
  });
}

/* ----------------------------- Preuves par évaluateur -------------------- */

const evidenceSchema = z.object({
  candidateId: z.guid(),
  skill_id: z.guid({ error: "Choisissez une compétence." }),
  level: z.enum(["debutant", "intermediaire", "avance", "expert"]),
  source: z.enum(["evaluateur", "projet", "exercice"]),
  project_id: z.preprocess((v) => (v === "" ? null : v), z.guid().nullable().optional()),
  confidence: z.enum(["faible", "moyenne", "elevee"]),
  notes: z.string().trim().min(10, "Décrivez la preuve observée (10 caractères minimum).").max(2000),
});

/** Validation d'une compétence par un évaluateur YEN (entretien technique, observation, portfolio…). */
export async function addSkillEvidenceAction(values: Record<string, unknown>): Promise<ActionResult> {
  return runAction({ permission: "assessments.review" }, async (ctx) => {
    const v = parseInput(evidenceSchema, values);
    const supabase = await createClient();
    const { error } = await supabase.from("skill_assessments").insert({
      candidate_id: v.candidateId, skill_id: v.skill_id, level: v.level, source: v.source, project_id: v.project_id ?? null,
      assessed_by: ctx.userId, confidence: v.confidence, status: "valide", notes: v.notes,
    });
    if (error) return fail(dbErrorMessage(error));
    await notifyCandidate(v.candidateId, { category: "evaluation", title: "Nouvelle compétence validée par YEN", link: "/candidat/competences" });
    revalidatePath(`/admin/talents/${v.candidateId}`);
    return { ok: true, message: "Compétence validée et ajoutée aux preuves." };
  });
}

const evidenceStatusSchema = z.object({ id: z.guid(), status: z.enum(["valide", "conteste", "invalide"]), notes: z.string().max(2000).optional().nullable() });
export async function setEvidenceStatusAction(values: Record<string, unknown>): Promise<ActionResult> {
  return runAction({ permission: "assessments.review" }, async () => {
    const v = parseInput(evidenceStatusSchema, values);
    const supabase = await createClient();
    const { data, error } = await supabase.from("skill_assessments").update({ status: v.status, ...(v.notes ? { notes: v.notes } : {}) }).eq("id", v.id).select("candidate_id").single();
    if (error) return fail(dbErrorMessage(error));
    revalidatePath(`/admin/talents/${data.candidate_id}`);
    return { ok: true, message: "Statut de la preuve mis à jour." };
  });
}

const verifySchema = z.object({
  projectId: z.guid(),
  status: z.enum(["verifie", "rejete", "non_verifie"]),
  note: z.string().trim().max(2000).optional().nullable(),
  level: z.preprocess((v) => (v === "" ? null : v), z.enum(["debutant", "intermediaire", "avance", "expert"]).nullable().optional()),
});

/** Vérification d'un projet ; optionnellement, ses compétences liées deviennent des preuves (source « projet »). */
export async function verifyProjectAction(values: Record<string, unknown>): Promise<ActionResult> {
  return runAction({ permission: "assessments.review" }, async (ctx) => {
    const v = parseInput(verifySchema, values);
    const supabase = await createClient();
    const { data: p, error } = await supabase
      .from("candidate_projects")
      .update({ verification_status: v.status, verified_by: ctx.userId, verified_at: new Date().toISOString(), verification_note: v.note ?? null })
      .eq("id", v.projectId)
      .select("id, candidate_id, title, project_skills(skill_id)")
      .single();
    if (error || !p) return fail(dbErrorMessage(error));
    if (v.status === "verifie" && v.level) {
      const skills = (p.project_skills ?? []) as { skill_id: string }[];
      if (skills.length) {
        const r = await supabase.from("skill_assessments").insert(skills.map((s) => ({
          candidate_id: p.candidate_id, skill_id: s.skill_id, level: v.level, source: "projet", project_id: p.id, assessed_by: ctx.userId,
          confidence: "moyenne", status: "valide", notes: `Projet vérifié : ${p.title}${v.note ? ` — ${v.note}` : ""}`,
        })));
        if (r.error) return fail(dbErrorMessage(r.error));
      }
    }
    await notifyCandidate(p.candidate_id, {
      category: "profil",
      title: v.status === "verifie" ? `Projet vérifié : ${p.title}` : v.status === "rejete" ? `Projet non validé : ${p.title}` : `Vérification du projet réinitialisée`,
      body: v.note ?? undefined,
      link: "/candidat/projets",
    });
    revalidatePath(`/admin/talents/${p.candidate_id}`);
    return { ok: true, message: "Vérification enregistrée." };
  });
}

const certificationStatusSchema = z.object({ id: z.guid(), status: z.enum(["non_verifie", "verifie", "rejete"]) });

/** Vérification d'une certification par YEN (justificatif consulté, lien de vérification contrôlé…). */
export async function setCertificationStatusAction(input: { id: string; status: "non_verifie" | "verifie" | "rejete" }): Promise<ActionResult> {
  return runAction({ permission: "assessments.review" }, async (ctx) => {
    const v = parseInput(certificationStatusSchema, input);
    const supabase = await createClient();
    const { data: c, error } = await supabase
      .from("candidate_certifications")
      .update({ verification_status: v.status })
      .eq("id", v.id)
      .select("id, candidate_id, name")
      .maybeSingle();
    if (error) return fail(dbErrorMessage(error));
    if (!c) return fail("Certification introuvable.");
    await logAudit(ctx.userId, "certification_verification", "candidate_certifications", c.id, { status: v.status });
    if (v.status !== "non_verifie") {
      await notifyCandidate(c.candidate_id, {
        category: "profil",
        title: v.status === "verifie" ? `Certification vérifiée : ${c.name}` : `Certification non validée : ${c.name}`,
        link: "/candidat/certifications",
      });
    }
    revalidatePath(`/admin/talents/${c.candidate_id}`);
    return { ok: true, message: v.status === "verifie" ? "Certification vérifiée." : v.status === "rejete" ? "Certification rejetée." : "Vérification annulée." };
  });
}

/* ----------------------------- Banque de questions ----------------------- */

const assessmentSchema = z.object({
  title: z.string().trim().min(3).max(200),
  description: z.string().trim().max(3000).default(""),
  domain_id: z.guid({ error: "Domaine requis." }),
  level: z.enum(["debutant", "intermediaire", "avance", "expert"]),
  assessment_type: z.enum(["questionnaire", "exercice_pratique", "etude_de_cas", "scenario", "evaluation_formateur", "portfolio"]),
  duration_minutes: z.number({ error: "Durée requise." }).int().min(1).max(480),
  passing_score: z.number().min(0).max(100),
  scoring_rules: z.string().trim().min(10, "Décrivez le barème (10 caractères minimum).").max(3000),
  max_attempts: z.preprocess((v) => (v === "" || v == null ? null : Number(v)), z.number().int().min(1).max(50).nullable()),
  cooldown_hours: z.number().int().min(0).max(720),
  skill_ids: z.array(z.guid()).default([]),
});

export async function saveAssessmentAction(values: Record<string, unknown>): Promise<ActionResult<{ id: string }>> {
  return runAction<{ id: string }>({ permission: "assessments.manage" }, async (ctx) => {
    const { skill_ids, ...v } = parseInput(assessmentSchema, values);
    const supabase = await createClient();
    const id = values.id;
    const res = isUuid(id)
      ? await supabase.from("assessments").update(v).eq("id", id).select("id").single()
      : await supabase.from("assessments").insert({ ...v, created_by: ctx.userId, status: "brouillon" }).select("id").single();
    if (res.error || !res.data) return fail(dbErrorMessage(res.error));
    await supabase.from("assessment_skills").delete().eq("assessment_id", res.data.id);
    if (skill_ids.length) await supabase.from("assessment_skills").insert(skill_ids.map((skill_id) => ({ assessment_id: res.data.id, skill_id })));
    revalidatePath("/admin/evaluations");
    return { ok: true, message: "Évaluation enregistrée.", data: { id: res.data.id } };
  });
}

const questionSchema = z.object({
  assessmentId: z.guid(),
  question_type: z.enum(["choix_unique", "choix_multiple", "reponse_courte", "reponse_longue", "etude_de_cas", "exercice_pratique"]),
  prompt: z.string().trim().min(5).max(5000),
  points: z.number().positive().max(100),
  skill_id: z.preprocess((v) => (v === "" ? null : v), z.guid().nullable().optional()),
  options: z.array(z.object({ label: z.string().trim().min(1).max(1000), is_correct: z.boolean() })).max(10).default([]),
  accepted_answers: z.array(z.string().trim().min(1).max(200)).max(20).default([]),
  rubric: z.array(z.object({ criterion: z.string().trim().min(2).max(500), points: z.number().positive().max(100) })).max(15).default([]),
  explanation: z.string().trim().max(2000).optional().nullable(),
});

export async function addQuestionAction(values: Record<string, unknown>): Promise<ActionResult> {
  return runAction({ permission: "assessments.manage" }, async () => {
    const v = parseInput(questionSchema, values);
    if (v.question_type === "choix_unique" && v.options.filter((o) => o.is_correct).length !== 1) return fail("Un choix unique doit avoir exactement une bonne réponse.");
    if (v.question_type === "choix_multiple" && !v.options.some((o) => o.is_correct)) return fail("Indiquez au moins une bonne réponse.");
    if (["choix_unique", "choix_multiple"].includes(v.question_type) && v.options.length < 2) return fail("Au moins deux options sont nécessaires.");
    if (v.rubric.length && Math.abs(v.rubric.reduce((s, r) => s + r.points, 0) - v.points) > 0.01) return fail("La somme des points de la grille doit égaler les points de la question.");
    const supabase = await createClient();
    const { count } = await supabase.from("assessment_questions").select("id", { count: "exact", head: true }).eq("assessment_id", v.assessmentId);
    const { data: q, error } = await supabase
      .from("assessment_questions")
      .insert({ assessment_id: v.assessmentId, position: (count ?? 0) + 1, question_type: v.question_type, prompt: v.prompt, points: v.points, skill_id: v.skill_id ?? null, accepted_answers: v.accepted_answers, rubric: v.rubric, explanation: v.explanation ?? null })
      .select("id")
      .single();
    if (error || !q) return fail(dbErrorMessage(error));
    if (v.options.length) {
      const r = await supabase.from("assessment_options").insert(v.options.map((o, i) => ({ question_id: q.id, position: i + 1, label: o.label, is_correct: o.is_correct })));
      if (r.error) return fail(dbErrorMessage(r.error));
    }
    await bumpVersionIfPublished(v.assessmentId);
    revalidatePath(`/admin/evaluations/${v.assessmentId}`);
    return { ok: true, message: "Question ajoutée." };
  });
}

export async function deleteQuestionAction(questionId: string, assessmentId: string): Promise<ActionResult> {
  return runAction({ permission: "assessments.manage" }, async () => {
    if (!isUuid(questionId) || !isUuid(assessmentId)) return fail("Paramètres invalides.");
    const supabase = await createClient();
    const { count: used } = await supabase.from("assessment_answers").select("id", { count: "exact", head: true }).eq("question_id", questionId);
    if (used) return fail("Cette question a déjà reçu des réponses : archivez l'évaluation et créez-en une nouvelle version plutôt que de la supprimer.");
    const { error } = await supabase.from("assessment_questions").delete().eq("id", questionId).eq("assessment_id", assessmentId);
    if (error) return fail(dbErrorMessage(error));
    await bumpVersionIfPublished(assessmentId);
    revalidatePath(`/admin/evaluations/${assessmentId}`);
    return { ok: true, message: "Question supprimée." };
  });
}

async function bumpVersionIfPublished(assessmentId: string) {
  const supabase = await createClient();
  const { data } = await supabase.from("assessments").select("status, version").eq("id", assessmentId).single();
  if (data?.status === "publie") await supabase.from("assessments").update({ version: data.version + 1 }).eq("id", assessmentId);
}

export async function setAssessmentStatusAction(assessmentId: string, status: "brouillon" | "publie" | "archive"): Promise<ActionResult> {
  return runAction({ permission: "assessments.manage" }, async () => {
    if (!isUuid(assessmentId) || !["brouillon", "publie", "archive"].includes(status)) return fail("Paramètres invalides.");
    const supabase = await createClient();
    if (status === "publie") {
      const { count } = await supabase.from("assessment_questions").select("id", { count: "exact", head: true }).eq("assessment_id", assessmentId);
      if (!count) return fail("Ajoutez au moins une question avant de publier.");
    }
    const { error } = await supabase.from("assessments").update({ status, ...(status === "publie" ? { published_at: new Date().toISOString() } : {}) }).eq("id", assessmentId);
    if (error) return fail(dbErrorMessage(error));
    if (status === "publie") {
      // Information des candidats du domaine (notification interne)
      const admin = createAdminClient();
      const { data: a } = await admin.from("assessments").select("title, domain_id").eq("id", assessmentId).single();
      const { data: cands } = await admin.from("candidate_profiles").select("id").eq("primary_domain_id", a?.domain_id ?? "");
      await Promise.all((cands ?? []).slice(0, 500).map((c) => notifyCandidate(c.id, { category: "evaluation", title: `Nouvelle évaluation : ${a?.title}`, link: `/candidat/evaluations/${assessmentId}` })));
    }
    revalidatePath("/admin/evaluations");
    return { ok: true, message: "Statut mis à jour." };
  });
}
