"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { z } from "@/lib/zod";
import { dbErrorMessage, fail, logAudit, parseInput, runAction, type ActionResult } from "@/lib/action";
import { createClient } from "@/lib/supabase/server";
import { isUuid } from "@/lib/utils";
import { PIPELINE_STATUSES } from "@/lib/labels";
import { notify, notifyCandidate } from "@/features/notifications/service";

/* ----------------------------- Suivi des candidats ----------------------- */

const noteSchema = z.object({
  candidateId: z.guid(),
  note_type: z.enum(["note", "decision", "entretien", "verification"]),
  body: z.string().trim().min(2, "Note vide.").max(5000),
});

export async function addInternalNoteAction(values: Record<string, unknown>): Promise<ActionResult> {
  return runAction({ permission: "notes.manage" }, async () => {
    const v = parseInput(noteSchema, values);
    const supabase = await createClient();
    const { error } = await supabase.from("internal_notes").insert({ candidate_id: v.candidateId, note_type: v.note_type, body: v.body });
    if (error) return fail(dbErrorMessage(error));
    revalidatePath(`/admin/talents/${v.candidateId}`);
    return { ok: true, message: "Note interne ajoutée (non visible par le candidat ni les partenaires)." };
  });
}

export async function deleteInternalNoteAction(noteId: string, candidateId: string): Promise<ActionResult> {
  return runAction({ permission: "notes.manage" }, async () => {
    if (!isUuid(noteId)) return fail("Note invalide.");
    const supabase = await createClient();
    const { error, count } = await supabase.from("internal_notes").delete({ count: "exact" }).eq("id", noteId);
    if (error) return fail(dbErrorMessage(error));
    if (!count) return fail("Seul l'auteur peut supprimer sa note.");
    revalidatePath(`/admin/talents/${candidateId}`);
    return { ok: true, message: "Note supprimée." };
  });
}

const followSchema = z.object({
  candidateId: z.guid(),
  pipeline_status: z.enum(PIPELINE_STATUSES as [string, ...string[]]),
  assigned_manager_id: z.preprocess((v) => (v === "" ? null : v), z.guid().nullable().optional()),
  review_flag: z.boolean().default(false),
  review_flag_reason: z.preprocess((v) => (v === "" ? null : v), z.string().trim().max(1000).nullable().optional()),
  reason: z.preprocess((v) => (v === "" ? null : v), z.string().trim().max(2000).nullable().optional()),
});

/** Statut de suivi, responsable affecté et marquage « à vérifier » (avec motif enregistré). */
export async function updateCandidateFollowUpAction(values: Record<string, unknown>): Promise<ActionResult> {
  return runAction({ permission: "candidates.manage" }, async () => {
    const v = parseInput(followSchema, values);
    if (v.review_flag && !v.review_flag_reason) return fail("Indiquez pourquoi ce profil doit être vérifié.");
    const supabase = await createClient();
    const { data: before } = await supabase.from("candidate_profiles").select("pipeline_status").eq("id", v.candidateId).single();
    const { error } = await supabase
      .from("candidate_profiles")
      .update({ pipeline_status: v.pipeline_status, assigned_manager_id: v.assigned_manager_id ?? null, review_flag: v.review_flag, review_flag_reason: v.review_flag ? v.review_flag_reason : null })
      .eq("id", v.candidateId);
    if (error) return fail(dbErrorMessage(error));
    if (before && before.pipeline_status !== v.pipeline_status) {
      await supabase.from("internal_notes").insert({ candidate_id: v.candidateId, note_type: "decision", body: `Statut de suivi : ${before.pipeline_status} → ${v.pipeline_status}${v.reason ? `. Motif : ${v.reason}` : ""}` });
    }
    revalidatePath(`/admin/talents/${v.candidateId}`);
    return { ok: true, message: "Suivi mis à jour." };
  });
}

const infoSchema = z.object({ candidateId: z.guid(), message: z.string().trim().min(10, "Message trop court.").max(2000) });
export async function requestInfoAction(values: Record<string, unknown>): Promise<ActionResult> {
  return runAction({ permission: "candidates.manage" }, async (ctx) => {
    const v = parseInput(infoSchema, values);
    const supabase = await createClient();
    const { error } = await supabase.from("info_requests").insert({ candidate_id: v.candidateId, requested_by: ctx.userId, message: v.message });
    if (error) return fail(dbErrorMessage(error));
    await notifyCandidate(v.candidateId, { category: "profil", title: "L'équipe YEN vous demande des informations complémentaires", body: v.message, link: "/candidat" });
    revalidatePath(`/admin/talents/${v.candidateId}`);
    return { ok: true, message: "Demande envoyée au candidat." };
  });
}

/* ----------------------------- Placements -------------------------------- */

const placementSchema = z
  .object({
    candidate_id: z.guid({ error: "Candidat requis." }),
    application_id: z.preprocess((v) => (v === "" ? null : v), z.guid().nullable().optional()),
    organization_id: z.preprocess((v) => (v === "" ? null : v), z.guid().nullable().optional()),
    organization_name: z.string().trim().min(2, "Organisation requise.").max(200),
    position_title: z.string().trim().min(2, "Poste requis.").max(200),
    placement_type: z.enum(["stage", "emploi"]),
    contract_type: z.enum(["stage", "cdd", "cdi", "alternance", "mission", "autre"]),
    start_date: z.iso.date({ error: "Date de début requise." }),
    end_date: z.preprocess((v) => (v === "" ? null : v), z.iso.date().nullable().optional()),
    duration_months: z.preprocess((v) => (v === "" || v == null ? null : Number(v)), z.number().int().min(0).max(600).nullable().optional()),
    follow_up_manager_id: z.preprocess((v) => (v === "" ? null : v), z.guid().nullable().optional()),
    confirmation_status: z.enum(["declare", "confirme", "annule"]),
    candidate_feedback: z.preprocess((v) => (v === "" ? null : v), z.string().trim().max(3000).nullable().optional()),
    organization_feedback: z.preprocess((v) => (v === "" ? null : v), z.string().trim().max(3000).nullable().optional()),
  })
  .refine((v) => !v.end_date || v.end_date >= v.start_date, { path: ["end_date"], message: "La date de fin précède la date de début." });

export async function savePlacementAction(values: Record<string, unknown>): Promise<ActionResult> {
  return runAction({ permission: "placements.manage" }, async (ctx) => {
    const v = parseInput(placementSchema, values);
    const supabase = await createClient();
    const id = values.id;
    const confirmFields = v.confirmation_status === "confirme" ? { confirmed_by: ctx.userId, confirmed_at: new Date().toISOString() } : { confirmed_by: null, confirmed_at: null };
    const res = isUuid(id)
      ? await supabase.from("placements").update({ ...v, ...confirmFields }).eq("id", id).select("id").single()
      : await supabase.from("placements").insert({ ...v, ...confirmFields, created_by: ctx.userId }).select("id").single();
    if (res.error) return fail(dbErrorMessage(res.error));
    if (v.confirmation_status === "confirme") {
      const pipe = await supabase.rpc("confirm_placement_pipeline", { p_candidate: v.candidate_id, p_placement_type: v.placement_type });
      if (pipe.error) console.error("[placements] pipeline non mis à jour", pipe.error.message);
      if (v.application_id) await supabase.from("applications").update({ status: "acceptee", decision_reason: "Placement confirmé", decided_by: ctx.userId, decided_at: new Date().toISOString() }).eq("id", v.application_id).neq("status", "acceptee");
      await notifyCandidate(v.candidate_id, { category: "decision", title: `Félicitations : ${v.placement_type === "stage" ? "stage" : "emploi"} confirmé`, body: `${v.position_title} — ${v.organization_name}`, link: "/candidat/candidatures" });
    }
    revalidatePath("/admin/placements");
    return { ok: true, message: "Placement enregistré." };
  });
}

/* ----------------------------- Utilisateurs et rôles --------------------- */

const activeSchema = z.object({ userId: z.guid(), active: z.boolean(), reason: z.string().trim().max(500).optional().nullable() });
export async function setUserActiveAction(values: Record<string, unknown>): Promise<ActionResult> {
  return runAction({ permission: "users.manage" }, async (ctx) => {
    const v = parseInput(activeSchema, values);
    if (v.userId === ctx.userId) return fail("Vous ne pouvez pas désactiver votre propre compte.");
    if (!v.active && !v.reason) return fail("Indiquez le motif de la désactivation.");
    const supabase = await createClient();
    const { error } = await supabase
      .from("profiles")
      .update({ is_active: v.active, deactivated_at: v.active ? null : new Date().toISOString(), deactivation_reason: v.active ? null : v.reason })
      .eq("id", v.userId);
    if (error) return fail(dbErrorMessage(error));
    if (!v.active) {
      // Fermeture des sessions en cours ; l'accès est de toute façon coupé en base (is_active)
      const rev = await supabase.rpc("revoke_user_sessions", { p_user: v.userId });
      if (rev.error || rev.data !== true) console.warn("[utilisateurs] sessions non fermées, le jeton expirera de lui-même", rev.error?.message ?? "");
    }
    revalidatePath("/admin/utilisateurs");
    return { ok: true, message: v.active ? "Compte réactivé." : "Compte désactivé." };
  });
}

const roleSchema = z.object({ userId: z.guid(), role: z.enum(["super_admin", "insertion_manager", "evaluator", "partner_manager", "candidate", "partner"]) });
export async function grantRoleAction(values: Record<string, unknown>): Promise<ActionResult> {
  return runAction({ permission: "roles.manage" }, async () => {
    const v = parseInput(roleSchema, values);
    const supabase = await createClient();
    const { error } = await supabase.from("user_roles").insert({ user_id: v.userId, role: v.role });
    if (error) return fail(dbErrorMessage(error));
    if (["super_admin", "insertion_manager", "evaluator", "partner_manager"].includes(v.role)) {
      await supabase.from("profiles").update({ account_type: "staff" }).eq("id", v.userId).neq("account_type", "candidate");
    }
    revalidatePath("/admin/utilisateurs");
    return { ok: true, message: "Rôle attribué." };
  });
}

export async function revokeRoleAction(values: Record<string, unknown>): Promise<ActionResult> {
  return runAction({ permission: "roles.manage" }, async () => {
    const v = parseInput(roleSchema, values);
    const supabase = await createClient();
    const { error, count } = await supabase.from("user_roles").delete({ count: "exact" }).eq("user_id", v.userId).eq("role", v.role);
    if (error) return fail(dbErrorMessage(error));
    if (!count) return fail("Rôle introuvable.");
    revalidatePath("/admin/utilisateurs");
    return { ok: true, message: "Rôle retiré." };
  });
}

/* ----------------------------- Paramètres -------------------------------- */

const settingsSchema = z.object({
  w_demonstrated_skills: z.number().min(0).max(100),
  w_assessments: z.number().min(0).max(100),
  w_projects: z.number().min(0).max(100),
  w_education: z.number().min(0).max(100),
  w_experience: z.number().min(0).max(100),
  max_cv_size_mb: z.number().min(1).max(10),
  partner_requires_validation: z.boolean(),
  auto_max_level: z.enum(["debutant", "intermediaire", "avance"]),
  insertion_window_months: z.number().int().min(1).max(36),
}).refine((v) => Math.abs(v.w_demonstrated_skills + v.w_assessments + v.w_projects + v.w_education + v.w_experience - 100) < 0.01, {
  path: ["w_experience"], message: "La somme des pondérations doit être égale à 100.",
});

export async function saveSettingsAction(values: Record<string, unknown>): Promise<ActionResult> {
  return runAction({ permission: "settings.manage" }, async (ctx) => {
    const v = parseInput(settingsSchema, values);
    const supabase = await createClient();
    const rows: [string, unknown][] = [
      ["matching.default_weights", { demonstrated_skills: v.w_demonstrated_skills, assessments: v.w_assessments, projects: v.w_projects, education: v.w_education, experience: v.w_experience }],
      ["documents.max_cv_size_mb", v.max_cv_size_mb],
      ["offers.partner_requires_validation", v.partner_requires_validation],
      ["assessments.auto_max_level", v.auto_max_level],
      ["reports.insertion_window_months", v.insertion_window_months],
    ];
    for (const [key, value] of rows) {
      const { error } = await supabase.from("platform_settings").update({ value, updated_by: ctx.userId, updated_at: new Date().toISOString() }).eq("key", key);
      if (error) return fail(dbErrorMessage(error));
    }
    revalidatePath("/admin/parametres");
    return { ok: true, message: "Paramètres enregistrés." };
  });
}


/* ----------------------------- Catalogue --------------------------------- */

const slug = z.string().trim().min(2).max(80).regex(/^[a-z0-9-]+$/, "Uniquement minuscules, chiffres et tirets.");
const lines = z.preprocess((v) => (typeof v === "string" ? v.split("\n").map((s) => s.trim()).filter(Boolean) : v), z.array(z.string().max(300)).max(50));

const domainSchema = z.object({
  slug, name: z.string().trim().min(3).max(200), short_description: z.string().trim().max(300), description: z.string().trim().max(5000),
  tools: lines, certifications: lines, project_types: lines, progression_criteria: z.string().trim().max(3000), icon: z.string().trim().max(30).default("cpu"),
  position: z.number().int().min(0).max(1000).default(100), is_active: z.boolean().default(true),
});
export async function saveDomainAction(values: Record<string, unknown>): Promise<ActionResult> {
  return runAction({ permission: "catalog.manage" }, async () => {
    const v = parseInput(domainSchema, values);
    const supabase = await createClient();
    const res = isUuid(values.id) ? await supabase.from("engineering_domains").update(v).eq("id", values.id) : await supabase.from("engineering_domains").insert(v);
    if (res.error) return fail(dbErrorMessage(res.error));
    revalidatePath("/admin/catalogue");
    revalidateTag("catalogue", "max");
    return { ok: true, message: "Domaine enregistré." };
  });
}

const skillSchema = z.object({
  slug, name: z.string().trim().min(2).max(200),
  domain_id: z.preprocess((v) => (v === "" ? null : v), z.guid().nullable().optional()),
  category: z.enum(["technique", "transversale", "outil"]), tier: z.enum(["fondamentale", "avancee"]),
  description: z.string().trim().max(2000).default(""),
  crit_debutant: z.string().trim().min(5, "Critère observable requis.").max(500),
  crit_intermediaire: z.string().trim().min(5, "Critère observable requis.").max(500),
  crit_avance: z.string().trim().min(5, "Critère observable requis.").max(500),
  crit_expert: z.string().trim().min(5, "Critère observable requis.").max(500),
  aliases: z.preprocess((v) => (typeof v === "string" ? v.split(",").map((s) => s.trim()).filter(Boolean) : v), z.array(z.string().max(80)).max(30)),
  is_active: z.boolean().default(true),
});
export async function saveSkillAction(values: Record<string, unknown>): Promise<ActionResult> {
  return runAction({ permission: "catalog.manage" }, async () => {
    const { crit_debutant, crit_intermediaire, crit_avance, crit_expert, ...v } = parseInput(skillSchema, values);
    const row = { ...v, level_criteria: { debutant: crit_debutant, intermediaire: crit_intermediaire, avance: crit_avance, expert: crit_expert } };
    const supabase = await createClient();
    const res = isUuid(values.id) ? await supabase.from("skills").update(row).eq("id", values.id) : await supabase.from("skills").insert(row);
    if (res.error) return fail(dbErrorMessage(res.error));
    revalidatePath("/admin/catalogue");
    revalidateTag("catalogue", "max");
    return { ok: true, message: "Compétence enregistrée." };
  });
}

const weightField = z.preprocess((v) => (v === "" || v == null ? null : Number(v)), z.number().min(0).max(100).nullable().optional());
const occupationSchema = z.object({
  slug, title: z.string().trim().min(3).max(200), domain_id: z.guid({ error: "Domaine requis." }),
  description: z.string().trim().max(3000).default(""), typical_education: z.string().trim().max(300).default(""), is_active: z.boolean().default(true),
  skills: z.array(z.object({ skill_id: z.guid(), required_level: z.enum(["debutant", "intermediaire", "avance", "expert"]), importance: z.enum(["obligatoire", "importante", "souhaitee"]) })).max(30).default([]),
  w_demonstrated_skills: weightField, w_assessments: weightField, w_projects: weightField, w_education: weightField, w_experience: weightField,
});
export async function saveOccupationAction(values: Record<string, unknown>): Promise<ActionResult> {
  return runAction({ permission: "catalog.manage" }, async () => {
    const { skills, w_demonstrated_skills, w_assessments, w_projects, w_education, w_experience, ...v } = parseInput(occupationSchema, values);
    const ws = [w_demonstrated_skills, w_assessments, w_projects, w_education, w_experience];
    let scoring_weights = null;
    if (ws.some((w) => w != null)) {
      if (ws.some((w) => w == null) || Math.abs(ws.reduce<number>((a, b) => a + (b ?? 0), 0) - 100) > 0.01) return fail("Renseignez les 5 pondérations (somme = 100) ou laissez-les vides.");
      scoring_weights = { demonstrated_skills: w_demonstrated_skills, assessments: w_assessments, projects: w_projects, education: w_education, experience: w_experience };
    }
    const supabase = await createClient();
    const res = isUuid(values.id)
      ? await supabase.from("occupations").update({ ...v, scoring_weights }).eq("id", values.id).select("id").single()
      : await supabase.from("occupations").insert({ ...v, scoring_weights }).select("id").single();
    if (res.error || !res.data) return fail(dbErrorMessage(res.error));
    await supabase.from("occupation_skills").delete().eq("occupation_id", res.data.id);
    const uniq = [...new Map(skills.map((s) => [s.skill_id, s])).values()];
    if (uniq.length) {
      const ins = await supabase.from("occupation_skills").insert(uniq.map((s) => ({ ...s, occupation_id: res.data.id })));
      if (ins.error) return fail(dbErrorMessage(ins.error));
    }
    revalidatePath("/admin/catalogue");
    revalidateTag("catalogue", "max");
    return { ok: true, message: "Métier enregistré." };
  });
}

/* ----------------------------- Partenaires -------------------------------- */

const orgSchema = z.object({
  name: z.string().trim().min(2).max(200), sector: z.string().trim().max(200).default(""), description: z.string().trim().max(5000).default(""),
  city: z.preprocess((v) => (v === "" ? null : v), z.string().trim().max(100).nullable().optional()), country: z.string().trim().min(2).max(100),
  website: z.preprocess((v) => (v === "" ? null : v), z.url({ protocol: /^https?$/ }).nullable().optional()),
  email: z.preprocess((v) => (v === "" ? null : v), z.email().nullable().optional()),
  phone: z.preprocess((v) => (v === "" ? null : v), z.string().trim().max(30).nullable().optional()),
  contact_name: z.preprocess((v) => (v === "" ? null : v), z.string().trim().max(200).nullable().optional()),
  contact_email: z.preprocess((v) => (v === "" ? null : v), z.email().nullable().optional()),
  contact_phone: z.preprocess((v) => (v === "" ? null : v), z.string().trim().max(30).nullable().optional()),
  partnership_type: z.enum(["recrutement", "stage", "formation", "institutionnel", "autre"]),
  domain_ids: z.array(z.guid()).max(15).default([]),
});

export async function saveOrganizationAction(values: Record<string, unknown>): Promise<ActionResult<{ id: string }>> {
  return runAction<{ id: string }>({ permission: "partners.manage" }, async (ctx) => {
    const { domain_ids, ...v } = parseInput(orgSchema, values);
    const supabase = await createClient();
    const res = isUuid(values.id)
      ? await supabase.from("organizations").update(v).eq("id", values.id).select("id").single()
      : await supabase.from("organizations").insert({ ...v, status: "actif", created_by: ctx.userId }).select("id").single();
    if (res.error || !res.data) return fail(dbErrorMessage(res.error));
    await supabase.from("organization_domains").delete().eq("organization_id", res.data.id);
    if (domain_ids.length) await supabase.from("organization_domains").insert(domain_ids.map((domain_id) => ({ organization_id: res.data.id, domain_id })));
    revalidatePath("/admin/partenaires");
    revalidateTag("partenaires", "max");
    return { ok: true, message: "Organisation enregistrée.", data: { id: res.data.id } };
  });
}

/** Mise à jour par le partenaire de la fiche de son organisation (champs descriptifs uniquement). */
export async function partnerUpdateOrganizationAction(values: Record<string, unknown>): Promise<ActionResult> {
  return runAction({}, async (ctx) => {
    const orgId = ctx.partnerOrganizationIds[0];
    if (!orgId) return fail("Espace partenaire non activé.");
    const { domain_ids, ...v } = parseInput(orgSchema.omit({ partnership_type: true }), values);
    const supabase = await createClient();
    const { error } = await supabase.from("organizations").update(v).eq("id", orgId);
    if (error) return fail(dbErrorMessage(error));
    await supabase.from("organization_domains").delete().eq("organization_id", orgId);
    if (domain_ids.length) await supabase.from("organization_domains").insert(domain_ids.map((domain_id) => ({ organization_id: orgId, domain_id })));
    revalidatePath("/partenaire/organisation");
    revalidateTag("partenaires", "max");
    return { ok: true, message: "Informations de l'organisation mises à jour." };
  });
}

const orgStatusSchema = z.object({
  organizationId: z.guid(),
  status: z.enum(["en_attente", "actif", "suspendu", "inactif"]),
  portal_enabled: z.boolean(),
  is_public: z.boolean(),
});

export async function setOrganizationStatusAction(values: Record<string, unknown>): Promise<ActionResult> {
  return runAction({ permission: "partners.manage" }, async () => {
    const v = parseInput(orgStatusSchema, values);
    const supabase = await createClient();
    const { error } = await supabase
      .from("organizations")
      .update({ status: v.status, portal_enabled: v.portal_enabled, is_public: v.is_public, public_authorized_at: v.is_public ? new Date().toISOString() : null })
      .eq("id", v.organizationId);
    if (error) return fail(dbErrorMessage(error));
    revalidatePath(`/admin/partenaires/${v.organizationId}`);
    return { ok: true, message: "Statut de l'organisation mis à jour." };
  });
}

const membershipSchema = z.object({ membershipId: z.guid(), status: z.enum(["actif", "revoque"]) });

/**
 * Validation d'un recruteur. Le rôle « partner » (et uniquement celui-ci) est
 * attribué via la clé de service après vérification de partners.manage.
 */
export async function setMembershipStatusAction(values: Record<string, unknown>): Promise<ActionResult> {
  return runAction({ permission: "partners.manage" }, async (ctx) => {
    const v = parseInput(membershipSchema, values);
    const supabase = await createClient();
    const { data: m, error } = await supabase
      .from("partner_memberships")
      .update({ status: v.status, approved_by: ctx.userId, approved_at: new Date().toISOString() })
      .eq("id", v.membershipId)
      .select("user_id, organization_id")
      .single();
    if (error || !m) return fail(dbErrorMessage(error));
    // rôle « partner » aligné en base sur les adhésions actives
    const role = await supabase.rpc("sync_partner_role", { p_user: m.user_id });
    if (role.error) return fail(dbErrorMessage(role.error, "L'accès n'a pas pu être mis à jour."));
    await logAudit(ctx.userId, v.status === "actif" ? "partner_member_approved" : "partner_member_revoked", "partner_memberships", v.membershipId, { organization_id: m.organization_id });
    revalidatePath(`/admin/partenaires/${m.organization_id}`);
    return { ok: true, message: v.status === "actif" ? "Recruteur validé : son espace partenaire est ouvert (si le portail de l'organisation est activé)." : "Accès révoqué." };
  });
}

const partnerRequestSchema = z.object({ organizationId: z.guid(), decision: z.enum(["accepter", "refuser"]) });

/**
 * Demande partenaire traitée en un clic depuis la liste des partenaires.
 * Accepter : une organisation en attente devient active avec son espace activé, ses recruteurs
 * en attente sont validés (rôle « partner » aligné en base) et prévenus.
 * Refuser : une organisation en attente devient inactive, ses recruteurs en attente sont refusés.
 * Une organisation suspendue ou inactive n'est jamais réactivée par ce raccourci : sa fiche reste
 * le seul endroit pour la réactiver.
 */
export async function decidePartnerRequestAction(values: Record<string, unknown>): Promise<ActionResult> {
  return runAction({ permission: "partners.manage" }, async (ctx) => {
    const v = parseInput(partnerRequestSchema, values);
    const accept = v.decision === "accepter";
    const supabase = await createClient();
    const { data: org, error } = await supabase.from("organizations").select("id, name, status").eq("id", v.organizationId).maybeSingle();
    if (error || !org) return fail(dbErrorMessage(error, "Organisation introuvable."));
    if (org.status !== "en_attente" && org.status !== "actif") return fail("Organisation suspendue ou inactive : ouvrez sa fiche pour décider.");

    if (org.status === "en_attente") {
      const { error: e } = await supabase
        .from("organizations")
        .update(accept ? { status: "actif", portal_enabled: true } : { status: "inactif", portal_enabled: false })
        .eq("id", org.id);
      if (e) return fail(dbErrorMessage(e));
    }
    const { data: members, error: me } = await supabase
      .from("partner_memberships")
      .update({ status: accept ? "actif" : "revoque", approved_by: ctx.userId, approved_at: new Date().toISOString() })
      .eq("organization_id", org.id)
      .eq("status", "en_attente")
      .select("user_id");
    if (me) return fail(dbErrorMessage(me));
    for (const m of members ?? []) {
      const role = await supabase.rpc("sync_partner_role", { p_user: m.user_id });
      if (role.error) return fail(dbErrorMessage(role.error, "L'accès n'a pas pu être mis à jour."));
    }

    await logAudit(ctx.userId, accept ? "partner_request_approved" : "partner_request_rejected", "organizations", org.id, { recruiters: (members ?? []).length });
    await Promise.all(
      (members ?? []).map((m) =>
        notify(
          m.user_id,
          accept
            ? { category: "systeme", title: "Votre espace partenaire est ouvert", body: `L'équipe YEN a validé ${org.name}. Vous pouvez publier vos offres et suivre vos candidatures.`, link: "/partenaire" }
            : { category: "systeme", title: "Demande d'espace partenaire non retenue", body: `La demande pour ${org.name} n'a pas été retenue. Contactez l'équipe YEN pour en savoir plus.` },
        ),
      ),
    );
    revalidatePath("/admin/partenaires");
    revalidatePath(`/admin/partenaires/${org.id}`);
    return { ok: true, message: accept ? `${org.name} : demande acceptée, l'espace partenaire est ouvert.` : `${org.name} : demande refusée.` };
  });
}

const orgEventSchema = z.object({
  organizationId: z.guid(),
  event_type: z.enum(["reunion", "convention", "recrutement", "retour", "autre"]),
  description: z.string().trim().min(3).max(3000),
  occurred_on: z.iso.date(),
});
export async function addOrganizationEventAction(values: Record<string, unknown>): Promise<ActionResult> {
  return runAction({ permission: "partners.manage" }, async (ctx) => {
    const v = parseInput(orgEventSchema, values);
    const supabase = await createClient();
    const { error } = await supabase.from("organization_events").insert({ organization_id: v.organizationId, event_type: v.event_type, description: v.description, occurred_on: v.occurred_on, created_by: ctx.userId });
    if (error) return fail(dbErrorMessage(error));
    revalidatePath(`/admin/partenaires/${v.organizationId}`);
    return { ok: true, message: "Événement ajouté à l'historique." };
  });
}
