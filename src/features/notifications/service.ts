import "server-only";
import { serverEnv } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/server";

export type NotificationCategory = "evaluation" | "recommandation" | "offre" | "candidature" | "profil" | "entretien" | "decision" | "systeme";

export interface NotificationInput {
  category: NotificationCategory;
  title: string;
  body?: string;
  link?: string;
}

/**
 * Canal externe (e-mail, SMS, WhatsApp). Aucun fournisseur n'est branché par
 * défaut : un message externe n'est envoyé que si (1) un fournisseur est
 * configuré, (2) le destinataire a consenti aux notifications externes.
 * Pour ajouter un fournisseur, implémenter ExternalChannel et l'enregistrer
 * dans channels() (voir docs/MODULES.md).
 */
export interface ExternalChannel {
  name: "email" | "sms" | "whatsapp";
  provider: string;
  send(userId: string, n: NotificationInput): Promise<void>;
}

function channels(): ExternalChannel[] {
  const env = serverEnv();
  const list: ExternalChannel[] = [];
  // Exemple : if (env.emailProvider === "resend") list.push(new ResendChannel(...));
  void env;
  return list;
}

/** Crée une notification interne pour un utilisateur (et, si configuré et consenti, un envoi externe). */
export async function notify(userId: string, n: NotificationInput): Promise<void> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("notifications")
      .insert({ user_id: userId, category: n.category, title: n.title.slice(0, 200), body: (n.body ?? "").slice(0, 2000), link: n.link ?? null })
      .select("id")
      .single();
    if (error || !data) throw error;

    const active = channels();
    if (active.length === 0) return;
    const { data: cand } = await admin.from("candidate_profiles").select("id").eq("user_id", userId).maybeSingle();
    let consented = false;
    if (cand) {
      const { data: c } = await admin.from("candidate_consents").select("granted").eq("candidate_id", cand.id).eq("consent_type", "notifications_externes").maybeSingle();
      consented = Boolean(c?.granted);
    }
    for (const ch of active) {
      if (!consented) {
        await admin.from("notification_deliveries").insert({ notification_id: data.id, channel: ch.name, status: "ignore", provider: ch.provider, error: "Consentement absent" });
        continue;
      }
      try {
        await ch.send(userId, n);
        await admin.from("notification_deliveries").insert({ notification_id: data.id, channel: ch.name, status: "envoye", provider: ch.provider, sent_at: new Date().toISOString() });
      } catch (e) {
        await admin.from("notification_deliveries").insert({ notification_id: data.id, channel: ch.name, status: "echoue", provider: ch.provider, error: e instanceof Error ? e.message.slice(0, 500) : "Erreur" });
      }
    }
  } catch (e) {
    console.error("[notifications] échec", e instanceof Error ? e.message : e);
  }
}

export async function notifyCandidate(candidateId: string, n: NotificationInput): Promise<void> {
  try {
    const admin = createAdminClient();
    const { data } = await admin.from("candidate_profiles").select("user_id").eq("id", candidateId).maybeSingle();
    if (data?.user_id) await notify(data.user_id, n);
  } catch (e) {
    console.error("[notifications] candidat introuvable", e instanceof Error ? e.message : e);
  }
}

/** Notifie les membres actifs d'une organisation partenaire. */
export async function notifyOrganization(organizationId: string, n: NotificationInput): Promise<void> {
  try {
    const admin = createAdminClient();
    const { data } = await admin.from("partner_memberships").select("user_id").eq("organization_id", organizationId).eq("status", "actif");
    await Promise.all((data ?? []).map((m) => notify(m.user_id, n)));
  } catch (e) {
    console.error("[notifications] organisation", e instanceof Error ? e.message : e);
  }
}

/** Notifie les membres du personnel disposant d'une permission (ex. nouvelles corrections à faire). */
export async function notifyStaffWithPermission(permission: string, n: NotificationInput): Promise<void> {
  try {
    const admin = createAdminClient();
    const { data: roles } = await admin.from("role_permissions").select("role").eq("permission_code", permission);
    const roleList = (roles ?? []).map((r) => r.role);
    if (!roleList.length) return;
    const { data: users } = await admin.from("user_roles").select("user_id").in("role", roleList);
    const ids = [...new Set((users ?? []).map((u) => u.user_id))];
    await Promise.all(ids.map((id) => notify(id, n)));
  } catch (e) {
    console.error("[notifications] personnel", e instanceof Error ? e.message : e);
  }
}
