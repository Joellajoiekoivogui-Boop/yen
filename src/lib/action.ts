import "server-only";
import { headers } from "next/headers";
import type { z } from "zod";
import { getSession, type SessionContext } from "@/lib/auth/session";
import type { Permission } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";

/** Résultat standard d'une action serveur, sérialisable vers le client. */
export type ActionResult<T = undefined> =
  | { ok: true; message?: string; data?: T }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

export class ActionError extends Error {
  constructor(message: string, public fieldErrors?: Record<string, string[]>) {
    super(message);
  }
}

export function fail(error: string, fieldErrors?: Record<string, string[]>): ActionResult<never> {
  return { ok: false, error, fieldErrors };
}

/** Valide des données avec un schéma Zod et lève une ActionError lisible. */
export function parseInput<S extends z.ZodType>(schema: S, input: unknown): z.infer<S> {
  const res = schema.safeParse(input);
  if (!res.success) {
    const fieldErrors: Record<string, string[]> = {};
    for (const issue of res.error.issues) {
      const key = issue.path.join(".") || "_";
      (fieldErrors[key] ??= []).push(issue.message);
    }
    throw new ActionError("Certaines informations sont invalides.", fieldErrors);
  }
  return res.data;
}

/** Traduit les erreurs Postgres/Supabase sans exposer de détails internes. */
/** Message affiché quand la base de production n'a pas reçu la dernière mise à jour SQL. */
export const DB_OUTDATED_MESSAGE =
  "La base de données de la plateforme n'est pas à jour : l'administrateur doit exécuter le script supabase/installation/4-MISE-A-JOUR.sql dans Supabase (SQL Editor).";

export function dbErrorMessage(err: { code?: string; message?: string } | null | undefined, fallback = "L'opération n'a pas pu être enregistrée."): string {
  if (!err) return fallback;
  // fonction, table ou colonne absente : mise à jour SQL non appliquée
  if (["PGRST202", "PGRST204", "PGRST205", "42883", "42703", "42P01"].includes(err.code ?? "")) {
    console.error("[base] schéma non à jour", err.code, err.message);
    return DB_OUTDATED_MESSAGE;
  }
  if (err.code === "42501") {
    // Les messages des triggers de protection sont rédigés pour l'utilisateur
    return err.message && /[éèàç]|autoris|réserv|consent|valid/i.test(err.message) ? err.message : "Action non autorisée.";
  }
  if (err.code === "P0001" && err.message) return err.message;
  if (err.code === "23505") return "Cet élément existe déjà.";
  if (err.code === "23503") return "Un élément lié est introuvable.";
  if (err.code === "23514") return "Une valeur ne respecte pas les règles attendues.";
  return fallback;
}

/**
 * Enveloppe une action : récupère la session, vérifie la permission éventuelle,
 * transforme les erreurs en résultat propre (jamais de trace technique côté client).
 */
export async function runAction<T>(
  opts: { permission?: Permission; requireCandidate?: boolean; allowAnonymous?: boolean },
  fn: (ctx: SessionContext) => Promise<ActionResult<T>>,
): Promise<ActionResult<T>> {
  try {
    const ctx = await getSession();
    if (!ctx && !opts.allowAnonymous) return fail("Votre session a expiré. Veuillez vous reconnecter.");
    if (ctx && !ctx.profile.is_active) return fail("Ce compte est désactivé.");
    if (opts.permission && !ctx?.permissions.has(opts.permission)) return fail("Vous n'avez pas la permission d'effectuer cette action.");
    if (opts.requireCandidate && !ctx?.candidateId) return fail("Action réservée aux candidats.");
    return await fn(ctx as SessionContext);
  } catch (e) {
    if (e instanceof ActionError) return fail(e.message, e.fieldErrors);
    // Les redirections Next.js doivent se propager
    if (e && typeof e === "object" && "digest" in e && String((e as { digest: unknown }).digest).startsWith("NEXT_")) throw e;
    console.error("[action] erreur inattendue", e instanceof Error ? e.message : e);
    // Configuration du serveur incomplète : message explicite pour l'administrateur
    if (e instanceof Error && e.message.includes("SUPABASE_SECRET_KEY")) {
      return fail("Fonction momentanément indisponible : la configuration du serveur est incomplète (clé secrète Supabase manquante). Prévenez l'administrateur de la plateforme.");
    }
    return fail("Une erreur inattendue est survenue. Veuillez réessayer.");
  }
}

export async function clientIp(): Promise<string> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "inconnu";
}

/**
 * Limitation de débit partagée (table rate_limits, fonction SQL rate_limit_hit).
 * Le plafond et la fenêtre de chaque type de clé sont fixés en base. En cas
 * d'indisponibilité, la limite n'est pas appliquée mais l'erreur est journalisée.
 */
export async function rateLimit(key: string): Promise<boolean> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("rate_limit_hit", { p_key: key });
    if (error) throw error;
    return data === true;
  } catch (e) {
    console.error("[rate-limit] indisponible", e instanceof Error ? e.message : e);
    return true;
  }
}

/**
 * Journal d'audit applicatif (exports, téléchargements, décisions). Jamais de secrets.
 * L'entrée est attribuée en base à l'utilisateur connecté (fonction log_audit).
 */
export async function logAudit(actorId: string | null, action: string, entityType: string, entityId: string | null, details: Record<string, unknown> = {}) {
  if (!actorId) return;
  try {
    const supabase = await createClient();
    const { error } = await supabase.rpc("log_audit", { p_action: action, p_entity_type: entityType, p_entity_id: entityId, p_details: details });
    if (error) throw error;
  } catch (e) {
    console.error("[audit] écriture impossible", e instanceof Error ? e.message : e);
  }
}
