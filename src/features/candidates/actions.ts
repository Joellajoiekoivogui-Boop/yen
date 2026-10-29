"use server";

import { revalidatePath } from "next/cache";
import { z } from "@/lib/zod";
import { dbErrorMessage, fail, logAudit, parseInput, runAction, type ActionResult } from "@/lib/action";
import { createClient } from "@/lib/supabase/server";
import { isUuid } from "@/lib/utils";
import {
  consentsSchema, declaredSkillSchema, educationSchema, experienceSchema, infoResponseSchema, languageSchema, profileSchema, projectSchema,
} from "./schemas";
import { refreshPipelineStatus } from "./pipeline";

/**
 * Actions du candidat. Toutes passent par le client lié à la session : les
 * politiques RLS garantissent qu'un candidat ne peut écrire que ses propres
 * données, quel que soit l'identifiant envoyé.
 */

async function touch(candidateId: string) {
  const supabase = await createClient();
  await supabase.from("candidate_profiles").update({ last_activity_at: new Date().toISOString() }).eq("id", candidateId);
}

export async function updateProfileAction(values: Record<string, unknown>): Promise<ActionResult> {
  return runAction({ requireCandidate: true }, async (ctx) => {
    const v = parseInput(profileSchema, values);
    const supabase = await createClient();
    const { first_name, last_name, phone, city, country, ...cand } = v;
    const p1 = await supabase.from("profiles").update({ first_name, last_name, phone, city, country }).eq("id", ctx.userId);
    if (p1.error) return fail(dbErrorMessage(p1.error));
    const p2 = await supabase.from("candidate_profiles").update({ ...cand, last_activity_at: new Date().toISOString() }).eq("id", ctx.candidateId!);
    if (p2.error) return fail(dbErrorMessage(p2.error));
    await refreshPipelineStatus(ctx.candidateId!);
    revalidatePath("/candidat", "layout");
    return { ok: true, message: "Profil enregistré." };
  });
}

type Table = "candidate_education" | "candidate_experiences" | "candidate_languages";
const SCHEMAS = { candidate_education: educationSchema, candidate_experiences: experienceSchema, candidate_languages: languageSchema } as const;

async function upsertChild(table: Table, values: Record<string, unknown>): Promise<ActionResult> {
  return runAction({ requireCandidate: true }, async (ctx) => {
    const id = values.id;
    const data = parseInput(SCHEMAS[table], values) as Record<string, unknown>;
    if (table === "candidate_experiences" && data.is_current) data.end_date = null;
    const supabase = await createClient();
    const res = isUuid(id)
      ? await supabase.from(table).update(data).eq("id", id).eq("candidate_id", ctx.candidateId!).select("id")
      : await supabase.from(table).insert({ ...data, candidate_id: ctx.candidateId }).select("id");
    if (res.error) return fail(dbErrorMessage(res.error));
    if (!res.data?.length) return fail("Élément introuvable.");
    await touch(ctx.candidateId!);
    await refreshPipelineStatus(ctx.candidateId!);
    revalidatePath("/candidat", "layout");
    return { ok: true, message: "Enregistré." };
  });
}

async function deleteChild(table: Table | "candidate_projects" | "candidate_skills", id: string): Promise<ActionResult> {
  return runAction({ requireCandidate: true }, async (ctx) => {
    if (!isUuid(id)) return fail("Identifiant invalide.");
    const supabase = await createClient();
    const { error, count } = await supabase.from(table).delete({ count: "exact" }).eq("id", id).eq("candidate_id", ctx.candidateId!);
    if (error) return fail(dbErrorMessage(error));
    if (!count) return fail("Élément introuvable.");
    revalidatePath("/candidat", "layout");
    return { ok: true, message: "Supprimé." };
  });
}

export async function saveEducationAction(v: Record<string, unknown>) { return upsertChild("candidate_education", v); }
export async function deleteEducationAction(id: string) { return deleteChild("candidate_education", id); }
export async function saveExperienceAction(v: Record<string, unknown>) { return upsertChild("candidate_experiences", v); }
export async function deleteExperienceAction(id: string) { return deleteChild("candidate_experiences", id); }
export async function saveLanguageAction(v: Record<string, unknown>) { return upsertChild("candidate_languages", v); }
export async function deleteLanguageAction(id: string) { return deleteChild("candidate_languages", id); }
export async function deleteProjectAction(id: string) { return deleteChild("candidate_projects", id); }
export async function deleteDeclaredSkillAction(id: string) { return deleteChild("candidate_skills", id); }

export async function saveProjectAction(values: Record<string, unknown>): Promise<ActionResult> {
  return runAction({ requireCandidate: true }, async (ctx) => {
    const { skill_ids, ...data } = parseInput(projectSchema, values);
    const supabase = await createClient();
    const id = values.id;
    const res = isUuid(id)
      ? await supabase.from("candidate_projects").update(data).eq("id", id).eq("candidate_id", ctx.candidateId!).select("id").single()
      : await supabase.from("candidate_projects").insert({ ...data, candidate_id: ctx.candidateId }).select("id").single();
    if (res.error || !res.data) return fail(dbErrorMessage(res.error));
    const projectId = res.data.id as string;
    await supabase.from("project_skills").delete().eq("project_id", projectId);
    if (skill_ids.length) {
      const ins = await supabase.from("project_skills").insert(skill_ids.map((skill_id) => ({ project_id: projectId, skill_id })));
      if (ins.error) return fail(dbErrorMessage(ins.error));
    }
    await touch(ctx.candidateId!);
    await refreshPipelineStatus(ctx.candidateId!);
    revalidatePath("/candidat", "layout");
    return { ok: true, message: "Projet enregistré. Il sera considéré comme une preuve après vérification par YEN." };
  });
}

export async function saveDeclaredSkillAction(values: Record<string, unknown>): Promise<ActionResult> {
  return runAction({ requireCandidate: true }, async (ctx) => {
    const v = parseInput(declaredSkillSchema, values);
    const supabase = await createClient();
    const { error } = await supabase
      .from("candidate_skills")
      .upsert({ ...v, candidate_id: ctx.candidateId, source: "saisie_manuelle" }, { onConflict: "candidate_id,skill_id" });
    if (error) return fail(dbErrorMessage(error));
    await touch(ctx.candidateId!);
    await refreshPipelineStatus(ctx.candidateId!);
    revalidatePath("/candidat", "layout");
    return { ok: true, message: "Compétence déclarée. Passez un entretien pour la démontrer." };
  });
}

export async function saveConsentsAction(values: Record<string, unknown>): Promise<ActionResult> {
  return runAction({ requireCandidate: true }, async (ctx) => {
    const v = parseInput(consentsSchema, values);
    const supabase = await createClient();
    const rows = Object.entries(v).map(([consent_type, granted]) => ({
      candidate_id: ctx.candidateId, consent_type, granted, updated_at: new Date().toISOString(), policy_version: "2026-10",
    }));
    const { error } = await supabase.from("candidate_consents").upsert(rows, { onConflict: "candidate_id,consent_type" });
    if (error) return fail(dbErrorMessage(error));
    revalidatePath("/candidat", "layout");
    return {
      ok: true,
      message: v.partage_partenaires ? "Préférences enregistrées." : "Préférences enregistrées. Les partages actifs avec des partenaires sont immédiatement suspendus.",
    };
  });
}

export async function respondInfoRequestAction(values: Record<string, unknown>): Promise<ActionResult> {
  return runAction({ requireCandidate: true }, async (ctx) => {
    const v = parseInput(infoResponseSchema, values);
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("info_requests")
      .update({ response: v.response, status: "repondue" })
      .eq("id", v.id)
      .eq("candidate_id", ctx.candidateId!)
      .select("id");
    if (error) return fail(dbErrorMessage(error));
    if (!data?.length) return fail("Demande introuvable.");
    revalidatePath("/candidat", "layout");
    return { ok: true, message: "Réponse envoyée à l'équipe YEN." };
  });
}

const recStatus = z.object({ id: z.guid(), status: z.enum(["active", "ignoree", "terminee"]) });
export async function setRecommendationStatusAction(id: string, status: string): Promise<ActionResult> {
  return runAction({ requireCandidate: true }, async (ctx) => {
    const v = parseInput(recStatus, { id, status });
    const supabase = await createClient();
    const { error } = await supabase.from("ai_recommendations").update({ status: v.status }).eq("id", v.id).eq("candidate_id", ctx.candidateId!);
    if (error) return fail(dbErrorMessage(error));
    revalidatePath("/candidat", "layout");
    return { ok: true };
  });
}

export async function markNotificationsReadAction(ids?: string[]): Promise<ActionResult> {
  return runAction({}, async (ctx) => {
    const supabase = await createClient();
    let q = supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("user_id", ctx.userId).is("read_at", null);
    if (ids?.length) q = q.in("id", ids.filter(isUuid));
    const { error } = await q;
    if (error) return fail(dbErrorMessage(error));
    revalidatePath("/", "layout");
    return { ok: true };
  });
}

/** Demande de suppression du compte : enregistrée et traitée par un administrateur (traçabilité). */
export async function requestAccountDeletionAction(reason: string): Promise<ActionResult> {
  return runAction({ requireCandidate: true }, async (ctx) => {
    const text = String(reason ?? "").slice(0, 1000);
    await logAudit(ctx.userId, "deletion_requested", "candidate_profiles", ctx.candidateId, { reason: text });
    return { ok: true, message: "Votre demande de suppression a été transmise à l'équipe YEN. Elle sera traitée dans les meilleurs délais." };
  });
}
