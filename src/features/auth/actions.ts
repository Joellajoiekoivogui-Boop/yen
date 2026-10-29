"use server";

import { revalidatePath } from "next/cache";
import { clientIp, dbErrorMessage, fail, logAudit, parseInput, runAction, type ActionResult } from "@/lib/action";
import { clearLoginFailures, loginRetryAfter, recordLoginFailure, takeEmailRequest } from "@/lib/security/attempts";
import { safeInternalPath } from "@/lib/utils";
import { getSession, homePathFor } from "@/lib/auth/session";
import { isSupabaseConfigured, publicEnv } from "@/lib/env";
import { createPublicClient } from "@/lib/supabase/public";
import { createClient } from "@/lib/supabase/server";
import { EMAIL_NOT_CONFIRMED_MESSAGE, signUpErrorMessage } from "./errors";
import { candidateSignUpSchema, contactDetailsSchema, newPasswordSchema, partnerSignUpSchema, resetRequestSchema, signInSchema } from "./schemas";

const NOT_CONFIGURED = "La plateforme n'est pas encore connectée à sa base de données (configuration Supabase manquante).";
const minutes = (seconds: number) => Math.max(1, Math.ceil(seconds / 60));
const isRateLimited = (error: { code?: string; status?: number }) =>
  error.status === 429 || error.code === "over_request_rate_limit" || error.code === "over_email_send_rate_limit";


export async function signInAction(values: Record<string, unknown>): Promise<ActionResult<{ redirectTo: string }>> {
  return runAction<{ redirectTo: string }>({ allowAnonymous: true }, async () => {
    if (!isSupabaseConfigured()) return fail(NOT_CONFIGURED);
    const input = parseInput(signInSchema, values);
    // Échecs comptés ici par (adresse IP, compte) : Supabase Auth ne voit que l'adresse du serveur
    const ip = await clientIp();
    const wait = loginRetryAfter(ip, input.email);
    if (wait) return fail(`Trop de tentatives de connexion. Réessayez dans ${minutes(wait)} minute(s), ou utilisez « Mot de passe oublié ».`);
    const supabase = await createClient();
    const { error } = await supabase.auth.signInWithPassword({ email: input.email, password: input.password });
    if (error) {
      if (error.code === "email_not_confirmed") return fail(EMAIL_NOT_CONFIRMED_MESSAGE);
      if (isRateLimited(error)) return fail("Trop de connexions en même temps sur la plateforme. Patientez une minute puis réessayez.");
      if (error.code === "invalid_credentials" || error.code === "invalid_grant" || error.status === 400) {
        recordLoginFailure(ip, input.email);
        // même message que le compte existe ou non
        return fail("Adresse e-mail ou mot de passe incorrect.");
      }
      // service indisponible : ce n'est pas la faute du mot de passe (code seul dans les journaux)
      console.error("[connexion] refus Supabase Auth", error.code, error.status);
      return fail("La connexion n'a pas pu aboutir : le service est momentanément indisponible. Réessayez dans un instant.");
    }
    clearLoginFailures(ip, input.email);
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
        data: { ...meta, account_type: "candidate", accepted_terms: "true" },
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
    if (data?.session) return { ok: true, message: "Compte créé : bienvenue !", data: { redirectTo: "/candidat" } };
    // message identique si l'adresse a déjà un compte (pas d'énumération), avec la marche à suivre dans ce cas
    return { ok: true, message: "Votre compte est créé. Ouvrez l'e-mail que nous venons de vous envoyer et cliquez sur le lien : vous pourrez ensuite vous connecter avec votre adresse e-mail et le mot de passe choisi. Si vous aviez déjà un compte avec cette adresse, connectez-vous ou utilisez « Mot de passe oublié »." };
  });
}

export async function signUpPartnerAction(values: Record<string, unknown>): Promise<ActionResult<{ redirectTo?: string }>> {
  return runAction<{ redirectTo?: string }>({ allowAnonymous: true }, async () => {
    if (!isSupabaseConfigured()) return fail(NOT_CONFIGURED);
    const input = parseInput(partnerSignUpSchema, values);
    const supabase = await createClient();
    const { password, password_confirm: _c, email, ...meta } = input;
    const { data, error } = await supabase.auth.signUp({
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
    // Sans confirmation d'e-mail côté Supabase, la session est ouverte immédiatement
    if (data?.session) return { ok: true, message: "Demande enregistrée.", data: { redirectTo: "/partenaire/en-attente" } };
    return {
      ok: true,
      message: "Demande enregistrée. Confirmez votre adresse e-mail grâce au lien reçu ; l'équipe YEN validera ensuite votre organisation avant d'activer votre espace partenaire.",
    };
  });
}

/** Coordonnées exigées avant d'entrer dans l'espace candidat ou l'administration (page « Vos coordonnées »). */
export async function saveContactDetailsAction(values: Record<string, unknown>): Promise<ActionResult<{ redirectTo: string }>> {
  return runAction<{ redirectTo: string }>({}, async (ctx) => {
    const input = parseInput(contactDetailsSchema, values);
    const supabase = await createClient();
    // client lié à la session : la politique RLS limite la mise à jour au profil de l'utilisateur
    const { error } = await supabase.from("profiles").update(input).eq("id", ctx.userId);
    if (error) return fail(dbErrorMessage(error));
    revalidatePath("/", "layout");
    return { ok: true, message: "Coordonnées enregistrées.", data: { redirectTo: homePathFor({ ...ctx, profile: { ...ctx.profile, ...input } }) } };
  });
}

/** Renvoie l'e-mail de confirmation d'inscription (réponse identique que le compte existe ou non). */
export async function resendConfirmationAction(values: Record<string, unknown>): Promise<ActionResult> {
  return runAction({ allowAnonymous: true }, async () => {
    if (!isSupabaseConfigured()) return fail(NOT_CONFIGURED);
    const input = parseInput(resetRequestSchema, values);
    const wait = takeEmailRequest(await clientIp(), input.email);
    if (wait) return fail(`Trop de demandes d'e-mail. Réessayez dans ${minutes(wait)} minute(s).`);
    const supabase = await createClient();
    const { error } = await supabase.auth.resend({ type: "signup", email: input.email, options: { emailRedirectTo: `${publicEnv.siteUrl}/auth/callback?suivant=/candidat` } });
    if (error?.code === "over_email_send_rate_limit" || error?.code === "over_request_rate_limit") return fail("Un e-mail vient déjà d'être envoyé. Patientez quelques minutes avant de réessayer.");
    if (error) console.error("[inscription] renvoi de l'e-mail refusé", error.code, error.status);
    return { ok: true, message: "Si un compte en attente correspond à cette adresse, un nouvel e-mail de confirmation vient d'être envoyé. Pensez à vérifier les courriers indésirables (spams)." };
  });
}

export async function requestPasswordResetAction(values: Record<string, unknown>): Promise<ActionResult> {
  return runAction({ allowAnonymous: true }, async () => {
    if (!isSupabaseConfigured()) return fail(NOT_CONFIGURED);
    const input = parseInput(resetRequestSchema, values);
    // plafond par adresse : un seul visiteur ne peut pas épuiser le quota d'e-mails du projet
    const wait = takeEmailRequest(await clientIp(), input.email);
    if (wait) return fail(`Trop de demandes de réinitialisation. Réessayez dans ${minutes(wait)} minute(s).`);
    const supabase = await createClient();
    const { error } = await supabase.auth.resetPasswordForEmail(input.email, {
      redirectTo: `${publicEnv.siteUrl}/auth/callback?suivant=/reinitialiser-mot-de-passe`,
    });
    if (error && isRateLimited(error)) return fail("Trop de demandes d'e-mail sur la plateforme pour le moment. Réessayez dans quelques minutes.");
    if (error) console.error("[mot de passe oublié] refus Supabase Auth", error.code, error.status);
    // Message identique que le compte existe ou non
    return { ok: true, message: "Si un compte correspond à cette adresse, un lien de réinitialisation vient d'être envoyé." };
  });
}

/** Session ouverte il y a moins de 15 minutes par un lien reçu par e-mail (mot de passe oublié, confirmation). */
async function openedByRecentEmailLink(supabase: Awaited<ReturnType<typeof createClient>>): Promise<boolean> {
  const { data } = await supabase.auth.getClaims();
  const amr = (data?.claims?.amr ?? []) as unknown[];
  const now = Date.now() / 1000;
  return amr.some((m) => {
    const entry = m as { method?: string; timestamp?: number };
    return (entry.method === "otp" || entry.method === "recovery") && typeof entry.timestamp === "number" && now - entry.timestamp < 15 * 60;
  });
}

/**
 * Nouveau mot de passe. Juste après un lien « Mot de passe oublié », la session vient d'être ouverte
 * par l'e-mail : aucun autre contrôle. Sinon (paramètres du compte), le mot de passe actuel est exigé,
 * pour qu'une session restée ouverte ailleurs ne suffise pas à s'emparer du compte.
 */
export async function updatePasswordAction(values: Record<string, unknown>): Promise<ActionResult<{ redirectTo: string }>> {
  return runAction<{ redirectTo: string }>({}, async (ctx) => {
    const input = parseInput(newPasswordSchema, values);
    const supabase = await createClient();
    if (!(await openedByRecentEmailLink(supabase))) {
      const current = typeof values.current_password === "string" ? values.current_password.slice(0, 128) : "";
      if (!current) return fail("Saisissez votre mot de passe actuel.");
      if (!ctx.email) return fail("Le mot de passe n'a pas pu être modifié.");
      const ip = await clientIp();
      const wait = loginRetryAfter(ip, ctx.email);
      if (wait) return fail(`Trop de tentatives. Réessayez dans ${minutes(wait)} minute(s), ou utilisez « Mot de passe oublié ».`);
      // vérification par une session séparée, sans cookies, fermée aussitôt (la session en cours n'est pas touchée)
      const check = createPublicClient();
      const { error: wrong } = await check.auth.signInWithPassword({ email: ctx.email, password: current });
      if (wrong) {
        if (isRateLimited(wrong)) return fail("Trop de demandes en même temps sur la plateforme. Patientez une minute puis réessayez.");
        recordLoginFailure(ip, ctx.email);
        return fail("Mot de passe actuel incorrect. Si vous vous connectez avec Google ou l'avez oublié, utilisez « Mot de passe oublié » sur la page de connexion.");
      }
      await check.auth.signOut({ scope: "local" });
    }
    const { error } = await supabase.auth.updateUser({ password: input.password });
    if (error) {
      if (error.code === "same_password") return fail("Le nouveau mot de passe doit être différent de l'ancien.");
      if (error.code === "weak_password") return fail("Ce mot de passe est trop faible.");
      return fail("Le mot de passe n'a pas pu être modifié. Le lien a peut-être expiré.");
    }
    // les autres appareils (dont un éventuel intrus) sont déconnectés ; cette session reste ouverte
    const others = await supabase.auth.signOut({ scope: "others" });
    if (others.error) console.error("[mot de passe] fermeture des autres sessions impossible", others.error.code);
    await logAudit(ctx.userId, "password_changed", "profiles", ctx.userId);
    return { ok: true, message: "Mot de passe mis à jour. Vos autres appareils ont été déconnectés.", data: { redirectTo: homePathFor(ctx) } };
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
