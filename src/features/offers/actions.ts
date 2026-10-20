"use server";

import { revalidatePath } from "next/cache";
import { dbErrorMessage, fail, logAudit, parseInput, runAction, type ActionResult } from "@/lib/action";
import type { SessionContext } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { isUuid } from "@/lib/utils";
import { notifyDomainCandidates, notifyOrganization, notifyStaffWithPermission } from "@/features/notifications/service";
import { offerSchema, weightsFromInput } from "./schemas";

async function persistOffer(ctx: SessionContext, values: Record<string, unknown>, mode: "staff" | "partner"): Promise<ActionResult<{ id: string }>> {
  const v = parseInput(offerSchema, values);
  if (mode === "partner" && !ctx.partnerOrganizationIds.includes(v.organization_id)) return fail("Organisation non autorisée.");
  const supabase = await createClient();
  const { skills, w_demonstrated_skills: _a, w_assessments: _b, w_projects: _c, w_education: _d, w_experience: _e, ...fields } = v;
  const row = { ...fields, scoring_weights: mode === "staff" ? weightsFromInput(v) : undefined };
  const id = values.id;

  if (isUuid(id) && mode === "partner") {
    const { data: cur } = await supabase.from("job_offers").select("status").eq("id", id).maybeSingle();
    if (!cur) return fail("Offre introuvable.");
    if (!["brouillon", "en_validation"].includes(cur.status)) return fail("Une offre publiée ne peut plus être modifiée par le partenaire : contactez YEN.");
  }
  const res = isUuid(id)
    ? await supabase.from("job_offers").update(row).eq("id", id).select("id").single()
    : await supabase.from("job_offers").insert({ ...row, status: "brouillon", created_by: ctx.userId }).select("id").single();
  if (res.error || !res.data) return fail(dbErrorMessage(res.error));
  const offerId = res.data.id as string;

  const del = await supabase.from("job_required_skills").delete().eq("offer_id", offerId);
  if (del.error) return fail(dbErrorMessage(del.error));
  const uniq = [...new Map(skills.map((s) => [s.skill_id, s])).values()];
  if (uniq.length) {
    const ins = await supabase.from("job_required_skills").insert(uniq.map((s) => ({ ...s, offer_id: offerId })));
    if (ins.error) return fail(dbErrorMessage(ins.error));
  }
  revalidatePath(mode === "staff" ? "/admin/offres" : "/partenaire/offres");
  return { ok: true, message: "Offre enregistrée.", data: { id: offerId } };
}

export async function saveOfferAction(values: Record<string, unknown>): Promise<ActionResult<{ id: string }>> {
  return runAction<{ id: string }>({ permission: "offers.manage" }, (ctx) => persistOffer(ctx, values, "staff"));
}

export async function partnerSaveOfferAction(values: Record<string, unknown>): Promise<ActionResult<{ id: string }>> {
  return runAction<{ id: string }>({}, async (ctx) => {
    if (!ctx.partnerOrganizationIds.length) return fail("Espace partenaire non activé.");
    return persistOffer(ctx, { ...values, organization_id: ctx.partnerOrganizationIds[0] }, "partner");
  });
}

/** Statuts : brouillon → en_validation → publiee → pourvue/fermee → archivee. */
export async function setOfferStatusAction(offerId: string, status: string): Promise<ActionResult> {
  return runAction({}, async (ctx) => {
    if (!isUuid(offerId)) return fail("Offre invalide.");
    const allowed = ["brouillon", "en_validation", "publiee", "pourvue", "fermee", "archivee"];
    if (!allowed.includes(status)) return fail("Statut invalide.");
    const isStaff = ctx.permissions.has("offers.manage");
    if (!isStaff && !(ctx.partnerOrganizationIds.length && ["brouillon", "en_validation", "fermee"].includes(status))) return fail("Action non autorisée.");
    const supabase = await createClient();
    const { data: offer, error } = await supabase
      .from("job_offers")
      .update({ status, ...(status === "publiee" && isStaff ? { validated_by: ctx.userId } : {}) })
      .eq("id", offerId)
      .select("id, title, organization_id, domain_id, offer_type")
      .single();
    if (error || !offer) return fail(dbErrorMessage(error));

    if (status === "en_validation" && !isStaff) {
      await notifyStaffWithPermission("offers.manage", { category: "offre", title: "Offre à valider", body: offer.title, link: `/admin/offres/${offer.id}` });
    }
    if (status === "publiee") {
      await notifyOrganization(offer.organization_id, { category: "offre", title: "Votre offre est publiée", body: offer.title, link: `/partenaire/offres/${offer.id}` });
      if (offer.domain_id) {
        // Information des candidats du domaine qui recherchent ce type d'opportunité
        await notifyDomainCandidates(offer.domain_id, offer.offer_type, { category: "offre", title: `Nouvelle offre : ${offer.title}`, link: `/candidat/offres/${offer.id}` });
      }
    }
    await logAudit(ctx.userId, "offer_status_changed", "job_offers", offer.id, { status });
    revalidatePath("/admin/offres");
    revalidatePath("/partenaire/offres");
    return { ok: true, message: "Statut de l'offre mis à jour." };
  });
}
