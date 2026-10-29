"use server";

import { revalidatePath } from "next/cache";
import { z } from "@/lib/zod";
import { dbErrorMessage, fail, logAudit, parseInput, runAction, type ActionResult } from "@/lib/action";
import { createClient } from "@/lib/supabase/server";
import { isUuid } from "@/lib/utils";
import { applicationStatusLabel } from "@/lib/labels";
import { computeMatch } from "@/features/matching/engine";
import { loadEvidence, loadOfferTarget } from "@/features/matching/loader";
import { notifyCandidate, notifyEvent, notifyOrganization } from "@/features/notifications/service";

/**
 * Reflète l'avancement d'une candidature dans le pipeline du candidat, sans
 * rétrograder un candidat placé. Le statut est relu en base (sync_application_pipeline).
 */
async function syncPipeline(applicationId: string) {
  try {
    const supabase = await createClient();
    const { error } = await supabase.rpc("sync_application_pipeline", { p_application: applicationId });
    if (error) throw error;
  } catch (e) {
    console.error("[pipeline] synchronisation impossible", e instanceof Error ? e.message : e);
  }
}

/** Instantané de compatibilité calculé côté serveur avec les droits du personnel YEN (jamais fourni par le candidat). */
async function snapshot(offerId: string, candidateId: string) {
  const supabase = await createClient();
  const target = await loadOfferTarget(supabase, offerId);
  const evidence = target ? await loadEvidence(supabase, candidateId, target.domainId) : null;
  return target && evidence ? { ...computeMatch(target, evidence), computed_at: new Date().toISOString() } : null;
}

/* ----------------------------- Candidat ---------------------------------- */

const applySchema = z.object({ offerId: z.guid(), motivation: z.preprocess((v) => (v === "" ? null : v), z.string().trim().max(5000).nullable().optional()) });

export async function applyToOfferAction(values: Record<string, unknown>): Promise<ActionResult> {
  return runAction({ requireCandidate: true }, async (ctx) => {
    const v = parseInput(applySchema, values);
    if (!ctx.profile.phone?.trim()) return fail("Ajoutez votre numéro de téléphone dans « Mon profil » avant de postuler : il est obligatoire pour que YEN puisse vous contacter.");
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("applications")
      .insert({ offer_id: v.offerId, candidate_id: ctx.candidateId, motivation: v.motivation ?? null })
      .select("id")
      .single();
    if (error || !data) return fail(error?.code === "23505" ? "Vous avez déjà postulé à cette offre." : dbErrorMessage(error, "La candidature n'a pas pu être envoyée."));
    // L'instantané de compatibilité est calculé par l'équipe YEN à la première consultation (ensureMatchSnapshots)
    await syncPipeline(data.id);
    await notifyEvent("application_submitted", data.id);
    revalidatePath("/candidat", "layout");
    return { ok: true, message: "Candidature envoyée. Votre profil professionnel est désormais visible par l'organisation pour cette offre." };
  });
}

export async function withdrawApplicationAction(applicationId: string): Promise<ActionResult> {
  return runAction({ requireCandidate: true }, async (ctx) => {
    if (!isUuid(applicationId)) return fail("Candidature invalide.");
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("applications")
      .update({ status: "retiree" })
      .eq("id", applicationId)
      .eq("candidate_id", ctx.candidateId!)
      .select("id")
      .single();
    if (error || !data) return fail(dbErrorMessage(error, "Retrait impossible."));
    await syncPipeline(data.id);
    await notifyEvent("application_withdrawn", data.id);
    revalidatePath("/candidat/candidatures");
    return { ok: true, message: "Candidature retirée." };
  });
}

/* ----------------------------- Personnel YEN ----------------------------- */

const associateSchema = z.object({ offerId: z.guid(), candidateId: z.guid(), note: z.string().trim().max(1000).optional().nullable() });

/** Associe un candidat à une offre (présélection YEN). Le partenaire ne le voit pas tant qu'il n'est pas proposé. */
export async function associateCandidateAction(values: Record<string, unknown>): Promise<ActionResult> {
  return runAction({ permission: "applications.manage" }, async (ctx) => {
    const v = parseInput(associateSchema, values);
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("applications")
      .insert({ offer_id: v.offerId, candidate_id: v.candidateId, origin: "yen", status: "preselectionnee", decision_reason: v.note ?? null, match_snapshot: await snapshot(v.offerId, v.candidateId) })
      .select("id, job_offers(title, offer_type)")
      .single();
    if (error || !data) return fail(error?.code === "23505" ? "Ce candidat est déjà associé à cette offre." : dbErrorMessage(error));
    const offer = data.job_offers as unknown as { title: string; offer_type: string };
    await syncPipeline(data.id);
    await notifyCandidate(v.candidateId, { category: "candidature", title: "Vous avez été présélectionné(e)", body: `L'équipe YEN vous a présélectionné(e) pour : ${offer.title}.`, link: "/candidat/candidatures" });
    await logAudit(ctx.userId, "candidate_shortlisted", "applications", data.id, { offer_id: v.offerId, candidate_id: v.candidateId });
    revalidatePath(`/admin/offres/${v.offerId}`);
    return { ok: true, message: "Candidat présélectionné." };
  });
}

const statusSchema = z.object({
  applicationId: z.guid(),
  status: z.enum(["soumise", "en_revue", "preselectionnee", "proposee_partenaire", "entretien_programme", "attente_decision", "acceptee", "refusee", "retiree"]),
  reason: z.string().trim().max(2000).optional().nullable(),
  internal: z.boolean().default(false),
});

/** Mise à jour du statut par YEN. « Proposée au partenaire » rend le profil visible (consentement exigé par la base). */
export async function updateApplicationStatusAction(values: Record<string, unknown>): Promise<ActionResult> {
  return runAction({ permission: "applications.manage" }, async (ctx) => {
    const v = parseInput(statusSchema, values);
    if ((v.status === "refusee" || v.status === "acceptee") && !v.reason) return fail("Indiquez le motif de la décision.");
    const supabase = await createClient();
    // étape interne : le motif reste sur l'étape masquée, jamais sur la candidature (lisible par le candidat)
    const patch: Record<string, unknown> = { status: v.status, decision_reason: v.internal ? null : v.reason ?? null };
    if (v.status === "proposee_partenaire") patch.visible_to_partner = true;
    if (v.status === "acceptee" || v.status === "refusee") { patch.decided_by = ctx.userId; patch.decided_at = new Date().toISOString(); }
    const { data, error } = await supabase
      .from("applications")
      .update(patch)
      .eq("id", v.applicationId)
      .select("id, candidate_id, offer_id, job_offers(title, organization_id, offer_type)")
      .single();
    if (error || !data) return fail(dbErrorMessage(error));
    const offer = data.job_offers as unknown as { title: string; organization_id: string; offer_type: string };
    if (v.internal) {
      // Masque la dernière étape au candidat (ex. revue interne)
      const hide = await supabase.rpc("hide_application_event", { p_application: data.id, p_status: v.status, p_note: v.reason ?? null });
      if (hide.error) console.error("[candidatures] étape non masquée", hide.error.message);
    }
    await syncPipeline(data.id);
    if (!v.internal) {
      await notifyCandidate(data.candidate_id, {
        category: v.status === "acceptee" || v.status === "refusee" ? "decision" : "candidature",
        title: `Candidature « ${offer.title} » : ${applicationStatusLabel[v.status]}`,
        link: "/candidat/candidatures",
      });
    }
    if (v.status === "proposee_partenaire") {
      await notifyOrganization(offer.organization_id, { category: "candidature", title: "Nouveau profil proposé par YEN", body: offer.title, link: `/partenaire/candidatures/${data.id}` });
    }
    revalidatePath(`/admin/offres/${data.offer_id}`);
    revalidatePath("/admin/candidatures");
    return { ok: true, message: "Statut mis à jour." };
  });
}

/* ----------------------------- Partenaire -------------------------------- */

const partnerStatusSchema = z.object({
  applicationId: z.guid(),
  status: z.enum(["proposee_partenaire", "entretien_programme", "attente_decision", "acceptee", "refusee"]),
  reason: z.string().trim().max(2000).optional().nullable(),
  shortlisted: z.boolean().optional(),
});

export async function partnerUpdateApplicationAction(values: Record<string, unknown>): Promise<ActionResult> {
  return runAction({}, async (ctx) => {
    if (!ctx.partnerOrganizationIds.length) return fail("Espace partenaire non activé.");
    const v = parseInput(partnerStatusSchema, values);
    if ((v.status === "refusee" || v.status === "acceptee") && !v.reason) return fail("Indiquez le motif de la décision.");
    const supabase = await createClient();
    const patch: Record<string, unknown> = { status: v.status, decision_reason: v.reason ?? null };
    if (v.shortlisted !== undefined) patch.partner_shortlisted = v.shortlisted;
    const { data, error } = await supabase.from("applications").update(patch).eq("id", v.applicationId).select("id").single();
    if (error || !data) return fail(dbErrorMessage(error, "Mise à jour impossible."));
    await syncPipeline(data.id);
    await notifyEvent("partner_status_update", data.id);
    revalidatePath(`/partenaire/candidatures/${data.id}`);
    return { ok: true, message: "Statut mis à jour." };
  });
}

export async function partnerToggleShortlistAction(applicationId: string, shortlisted: boolean): Promise<ActionResult> {
  return runAction({}, async (ctx) => {
    if (!ctx.partnerOrganizationIds.length || !isUuid(applicationId)) return fail("Action non autorisée.");
    const supabase = await createClient();
    // seule la présélection change : le statut de la candidature reste celui fixé par YEN ou le candidat
    const { data, error } = await supabase.from("applications").update({ partner_shortlisted: shortlisted }).eq("id", applicationId).select("id");
    if (error) return fail(dbErrorMessage(error));
    if (!data?.length) return fail("Candidature introuvable.");
    revalidatePath("/partenaire", "layout");
    return { ok: true, message: shortlisted ? "Ajouté à votre présélection." : "Retiré de votre présélection." };
  });
}

const interviewSchema = z.object({
  applicationId: z.guid(),
  scheduled_at: z.string().min(10, "Date requise."),
  duration_minutes: z.number().int().min(5).max(600).default(45),
  mode: z.enum(["presentiel", "visio", "telephone"]),
  location: z.preprocess((v) => (v === "" ? null : v), z.string().trim().max(300).nullable().optional()),
  interviewers: z.preprocess((v) => (v === "" ? null : v), z.string().trim().max(300).nullable().optional()),
});

export async function scheduleInterviewAction(values: Record<string, unknown>): Promise<ActionResult> {
  return runAction({}, async (ctx) => {
    if (!ctx.permissions.has("applications.manage") && !ctx.partnerOrganizationIds.length) return fail("Action non autorisée.");
    const v = parseInput(interviewSchema, values);
    const when = new Date(v.scheduled_at);
    if (Number.isNaN(when.getTime())) return fail("Date invalide.");
    const supabase = await createClient();
    const { data: interview, error } = await supabase.from("interviews").insert({
      application_id: v.applicationId, scheduled_at: when.toISOString(), duration_minutes: v.duration_minutes, mode: v.mode,
      location: v.location ?? null, interviewers: v.interviewers ?? null, created_by: ctx.userId,
    }).select("id").single();
    if (error || !interview) return fail(dbErrorMessage(error));
    const { data: app } = await supabase.from("applications").update({ status: "entretien_programme" }).eq("id", v.applicationId).select("id").single();
    if (app) {
      await syncPipeline(v.applicationId);
      // message (date, modalité, lieu) rédigé en base à partir de l'entretien enregistré
      await notifyEvent("interview_scheduled", interview.id);
    }
    revalidatePath("/admin", "layout");
    revalidatePath("/partenaire", "layout");
    return { ok: true, message: "Entretien programmé et candidat notifié." };
  });
}

const interviewUpdateSchema = z.object({ id: z.guid(), status: z.enum(["programme", "realise", "annule", "reporte"]), outcome: z.string().trim().max(3000).optional().nullable() });
export async function updateInterviewAction(values: Record<string, unknown>): Promise<ActionResult> {
  return runAction({}, async () => {
    const v = parseInput(interviewUpdateSchema, values);
    const supabase = await createClient();
    const { data, error } = await supabase.from("interviews").update({ status: v.status, outcome: v.outcome ?? null }).eq("id", v.id).select("id");
    if (error) return fail(dbErrorMessage(error, "Mise à jour impossible."));
    // aucune ligne modifiée : entretien inexistant ou non autorisé (règles d'accès de la base)
    if (!data?.length) return fail("Entretien introuvable ou modification non autorisée.");
    revalidatePath("/admin", "layout");
    revalidatePath("/partenaire", "layout");
    return { ok: true, message: "Entretien mis à jour." };
  });
}

const feedbackSchema = z.object({
  applicationId: z.guid(),
  context: z.enum(["entretien", "stage", "emploi"]),
  overall_rating: z.preprocess((v) => (v === "" || v == null ? null : Number(v)), z.number().int().min(1).max(5).nullable().optional()),
  comments: z.string().trim().min(10, "Commentaire trop court.").max(5000),
  skill_ratings: z.array(z.object({ skill_id: z.guid(), level: z.enum(["debutant", "intermediaire", "avance", "expert"]), comment: z.string().max(500).optional() })).max(20).default([]),
});

/**
 * Retour d'un partenaire sur les compétences. Les niveaux indiqués sont
 * enregistrés comme preuves « en attente » : ils ne comptent qu'après
 * validation par un évaluateur YEN.
 */
export async function partnerFeedbackAction(values: Record<string, unknown>): Promise<ActionResult> {
  return runAction({}, async (ctx) => {
    if (!ctx.partnerOrganizationIds.length) return fail("Espace partenaire non activé.");
    const v = parseInput(feedbackSchema, values);
    const supabase = await createClient();
    const { data: feedback, error } = await supabase.from("partner_feedback").insert({
      application_id: v.applicationId, author_id: ctx.userId, context: v.context, overall_rating: v.overall_rating ?? null, comments: v.comments, skill_ratings: v.skill_ratings,
    }).select("id").single();
    if (error || !feedback) return fail(dbErrorMessage(error, "Retour non enregistré."));
    if (v.skill_ratings.length) {
      // preuves « en attente » : validées ou écartées ensuite par un évaluateur YEN
      const fb = await supabase.rpc("add_partner_skill_feedback", { p_application: v.applicationId, p_context: v.context, p_ratings: v.skill_ratings });
      if (fb.error) return fail(dbErrorMessage(fb.error, "Retour enregistré, mais les appréciations des compétences n'ont pas pu être transmises."));
    }
    await notifyEvent("partner_feedback", feedback.id);
    revalidatePath(`/partenaire/candidatures/${v.applicationId}`);
    return { ok: true, message: "Merci : votre retour a été transmis à l'équipe YEN." };
  });
}

/* ----------------------------- Partages ---------------------------------- */

const shareSchema = z.object({
  candidateId: z.guid(),
  organization_id: z.guid({ error: "Organisation requise." }),
  offer_id: z.preprocess((v) => (v === "" ? null : v), z.guid().nullable().optional()),
  reason: z.string().trim().min(10, "Motif requis (10 caractères minimum).").max(1000),
  include_cv: z.boolean().default(true),
  expires_in_days: z.number().int().min(1).max(365).default(90),
});

export async function shareProfileAction(values: Record<string, unknown>): Promise<ActionResult> {
  return runAction({ permission: "shares.manage" }, async () => {
    const v = parseInput(shareSchema, values);
    const supabase = await createClient();
    const { error } = await supabase.from("profile_shares").insert({
      candidate_id: v.candidateId, organization_id: v.organization_id, offer_id: v.offer_id ?? null, reason: v.reason, include_cv: v.include_cv,
      expires_at: new Date(Date.now() + v.expires_in_days * 86400_000).toISOString(),
    });
    if (error) return fail(dbErrorMessage(error));
    await notifyCandidate(v.candidateId, { category: "profil", title: "Votre profil a été partagé avec un partenaire", body: "Vous pouvez retirer votre consentement à tout moment dans Paramètres et confidentialité.", link: "/candidat/parametres" });
    await notifyOrganization(v.organization_id, { category: "candidature", title: "Un profil vous a été partagé par YEN", link: "/partenaire/profils" });
    revalidatePath(`/admin/talents/${v.candidateId}`);
    return { ok: true, message: "Profil partagé." };
  });
}

export async function revokeShareAction(shareId: string): Promise<ActionResult> {
  return runAction({ permission: "shares.manage" }, async () => {
    if (!isUuid(shareId)) return fail("Partage invalide.");
    const supabase = await createClient();
    const { data, error } = await supabase.from("profile_shares").update({ revoked_at: new Date().toISOString() }).eq("id", shareId).select("candidate_id").single();
    if (error) return fail(dbErrorMessage(error));
    revalidatePath(`/admin/talents/${data.candidate_id}`);
    return { ok: true, message: "Partage révoqué." };
  });
}
