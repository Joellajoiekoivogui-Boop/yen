"use server";

import { fail, logAudit, parseInput, runAction, type ActionResult } from "@/lib/action";
import { safeInternalPath } from "@/lib/utils";
import { getSession, homePathFor } from "@/lib/auth/session";
import { isSupabaseConfigured, publicEnv } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { signUpErrorMessage } from "./errors";
import { candidateSignUpSchema, newPasswordSchema, partnerSignUpSchema, resetRequestSchema, signInSchema } from "./schemas";

const NOT_CONFIGURED = "La plateforme n'est pas encore connectée à sa base de données (configuration Supabase manquante).";


export async function signInAction(values: Record<string, unknown>): Promise<ActionResult<{ redirectTo: string }>> {
  return runAction<{ redirectTo: string }>({ allowAnonymous: true }, async () => {
    if (!isSupabaseConfigured()) return fail(NOT_CONFIGURED);
    const input = parseInput(signInSchema, values);
    // Tentatives limitées par Supabase Auth (par adresse IP) ; voir Authentication → Rate Limits
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
    // chemins internes uniquement (pas de redirection ouverte)
    const next = safeInternalPath(values.next);
    return { ok: true, data: { redirectTo: next ?? (ctx ? homePathFor(ctx) : "/") } };
  });
}

export async function signUpCandidateAction(values: Record<string, unknown>): Promise<ActionResult<{ redirectTo?: string }>> {
  return runAction<{ redirectTo?: string }>({ allowAnonymous: true }, async () => {
    if (!isSupabaseConfigured()) return fail(NOT_CONFIGURED);
    const input = parseInput(candidateSignUpSchema, values);
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
