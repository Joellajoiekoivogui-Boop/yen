import "server-only";
import { serverEnv } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

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

/**
 * Notifications internes : créées en base par des fonctions SQL qui vérifient
 * qui peut prévenir qui (personnel YEN, candidat concerné, organisation qui suit
 * la candidature). Toujours « au mieux » : un échec n'interrompt jamais l'action.
 */
async function rpcNotify(fn: string, args: Record<string, unknown>, n: NotificationInput) {
  try {
    const supabase = await createClient();
    const { error } = await supabase.rpc(fn, { ...args, p_category: n.category, p_title: n.title.slice(0, 200), p_body: (n.body ?? "").slice(0, 2000), p_link: n.link ?? null });
    if (error) throw error;
    if (channels().length) console.warn("[notifications] canaux externes configurés : l'envoi externe n'est pas encore branché sur les fonctions SQL");
  } catch (e) {
    console.error(`[notifications] ${fn}`, e instanceof Error ? e.message : e);
  }
}

/** Notification à un utilisateur précis (réservé au personnel YEN). */
export async function notify(userId: string, n: NotificationInput): Promise<void> {
  await rpcNotify("notify_user", { p_user: userId }, n);
}

/** Notifie le compte associé à un profil candidat. */
export async function notifyCandidate(candidateId: string, n: NotificationInput): Promise<void> {
  await rpcNotify("notify_candidate", { p_candidate: candidateId }, n);
}

/** Notifie les membres actifs d'une organisation partenaire. */
export async function notifyOrganization(organizationId: string, n: NotificationInput): Promise<void> {
  await rpcNotify("notify_organization", { p_organization: organizationId }, n);
}

/** Notifie le personnel YEN disposant d'une permission donnée. */
export async function notifyStaffWithPermission(permission: string, n: NotificationInput): Promise<void> {
  await rpcNotify("notify_staff", { p_permission: permission }, n);
}

/** Notifie les candidats d'un domaine (nouvelle évaluation, ou nouvelle offre d'un type donné). */
export async function notifyDomainCandidates(domainId: string, offerType: string | null, n: NotificationInput): Promise<void> {
  await rpcNotify("notify_candidates_by_domain", { p_domain: domainId, p_offer_type: offerType }, n);
}
