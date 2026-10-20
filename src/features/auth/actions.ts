"use server";

import { clientIp, fail, logAudit, parseInput, rateLimit, runAction, type ActionResult } from "@/lib/action";
import { getSession, homePathFor } from "@/lib/auth/session";
import { isSupabaseConfigured, publicEnv } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { signUpErrorMessage } from "./errors";
import { candidateSignUpSchema, newPasswordSchema, partnerSignUpSchema, resetRequestSchema, signInSchema } from "./schemas";

const NOT_CONFIGURED = "La plateforme n'est pas encore connectée à sa base de données (configuration Supabase manquante).";

/** N'accepte que des chemins internes pour éviter les redirections ouvertes. */
function safeNext(next: unknown): string | null {
  return typeof next === "string" && next.startsWith("/") && !next.startsWith("//") && !next.includes("\\") ? next : null;
}

export async function signInAction(values: Record<string, unknown>): Promise<ActionResult<{ redirectTo: string }>> {
  return runAction<{ redirectTo: string }>({ allowAnonymous: true }, async () => {
    if (!isSupabaseConfigured()) return fail(NOT_CONFIGURED);
    const input = parseInput(signInSchema, values);
    const ip = await clientIp();
    if (!(await rateLimit(`login:ip:${ip}`, 30, 900)) || !(await rateLimit(`login:email:${input.email}`, 8, 900))) {
      return fail("Trop de tentatives de connexion. Patientez 15 minutes avant de réessayer.");
    }
    const supabase = await createClient();
    const { error } = await supabase.auth.signInWithPassword({ email: input.email, password: input.password });
    if (error) {
      if (error.code === "email_not_confirmed") return fail("Veuillez confirmer votre adresse e-mail à l'aide du lien reçu avant de vous connecter.");
      return fail("Adresse e-mail ou mot de passe incorrect.");
    }
    const ctx = await getSession();
    if (ctx && !ctx.profile.is_active) {
      await supabase.auth.signOut();
      return fail("Ce compte est désactivé. Contactez l'équipe YEN.");
    }
    const next = safeNext(values.next);
    return { ok: true, data: { redirectTo: next ?? (ctx ? homePathFor(ctx) : "/") } };
  });
}

export async function signUpCandidateAction(values: Record<string, unknown>): Promise<ActionResult<{ redirectTo?: string }>> {
  return runAction<{ redirectTo?: string }>({ allowAnonymous: true }, async () => {
    if (!isSupabaseConfigured()) return fail(NOT_CONFIGURED);
    const input = parseInput(candidateSignUpSchema, values);
    if (!(await rateLimit(`signup:ip:${await clientIp()}`, 10, 3600))) return fail("Trop d'inscriptions depuis cette connexion. Réessayez plus tard.");
    const supabase = await createClient();
    const { password, password_confirm: _c, email, ...meta } = input;
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${publicEnv.siteUrl}/auth/callback?suivant=/candidat`,
        data: { ...meta, account_type: "candidate", accepted_terms: "true", graduation_year: String(meta.graduation_year) },
      },
    });
    if (error) {
      // Code seul dans les journaux (jamais l'adresse) pour diagnostiquer depuis Vercel
      console.error("[inscription] refus Supabase Auth", error.code, error.status);
      // Réponse identique si le compte existe déjà (pas d'énumération des comptes)
      const message = signUpErrorMessage(error.code);
      if (message) return fail(message);
    }
    // Si la confirmation d'e-mail est désactivée côté Supabase, une session est ouverte immédiatement
    if (data?.session) return { ok: true, message: "Compte créé.", data: { redirectTo: "/candidat" } };
    return { ok: true, message: "Compte créé. Un e-mail de confirmation vous a été envoyé : cliquez sur le lien pour activer votre compte." };
  });
}

export async function signUpPartnerAction(values: Record<string, unknown>): Promise<ActionResult> {
  return runAction({ allowAnonymous: true }, async () => {
    if (!isSupabaseConfigured()) return fail(NOT_CONFIGURED);
    const input = parseInput(partnerSignUpSchema, values);
    if (!(await rateLimit(`signup:ip:${await clientIp()}`, 10, 3600))) return fail("Trop d'inscriptions depuis cette connexion. Réessayez plus tard.");
    const supabase = await createClient();
    const { password, password_confirm: _c, email, ...meta } = input;
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${publicEnv.siteUrl}/auth/callback?suivant=/partenaire/en-attente`,
        data: { ...meta, account_type: "partner", accepted_terms: "true" },
      },
    });
    if (error) {
      console.error("[inscription partenaire] refus Supabase Auth", error.code, error.status);
      const message = signUpErrorMessage(error.code);
      if (message) return fail(message);
    }
    return {
      ok: true,
      message: "Demande enregistrée. Confirmez votre adresse e-mail ; l'équipe YEN validera ensuite votre organisation avant d'activer votre espace partenaire.",
    };
  });
}

export async function requestPasswordResetAction(values: Record<string, unknown>): Promise<ActionResult> {
  return runAction({ allowAnonymous: true }, async () => {
    if (!isSupabaseConfigured()) return fail(NOT_CONFIGURED);
    const input = parseInput(resetRequestSchema, values);
    if (!(await rateLimit(`reset:ip:${await clientIp()}`, 10, 3600)) || !(await rateLimit(`reset:email:${input.email}`, 3, 3600))) {
      return fail("Trop de demandes. Réessayez plus tard.");
    }
    const supabase = await createClient();
    await supabase.auth.resetPasswordForEmail(input.email, {
      redirectTo: `${publicEnv.siteUrl}/auth/callback?suivant=/reinitialiser-mot-de-passe`,
    });
    // Message identique que le compte existe ou non
    return { ok: true, message: "Si un compte correspond à cette adresse, un lien de réinitialisation vient d'être envoyé." };
  });
}

export async function updatePasswordAction(values: Record<string, unknown>): Promise<ActionResult<{ redirectTo: string }>> {
  return runAction<{ redirectTo: string }>({}, async (ctx) => {
    const input = parseInput(newPasswordSchema, values);
    const supabase = await createClient();
    const { error } = await supabase.auth.updateUser({ password: input.password });
    if (error) {
      if (error.code === "same_password") return fail("Le nouveau mot de passe doit être différent de l'ancien.");
      if (error.code === "weak_password") return fail("Ce mot de passe est trop faible.");
      return fail("Le mot de passe n'a pas pu être modifié. Le lien a peut-être expiré.");
    }
    await logAudit(ctx.userId, "password_changed", "profiles", ctx.userId);
    return { ok: true, message: "Mot de passe mis à jour.", data: { redirectTo: homePathFor(ctx) } };
  });
}

/** Déconnecte toutes les sessions de l'utilisateur (tous appareils). */
export async function signOutEverywhereAction(): Promise<ActionResult> {
  return runAction({}, async (ctx) => {
    const supabase = await createClient();
    await supabase.auth.signOut({ scope: "global" });
    await logAudit(ctx.userId, "sessions_revoked", "profiles", ctx.userId);
    return { ok: true, message: "Toutes vos sessions ont été fermées." };
  });
}
