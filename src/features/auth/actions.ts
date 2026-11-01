"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { clientIp, dbErrorMessage, fail, logAudit, parseInput, runAction, type ActionResult } from "@/lib/action";
import { clearLoginFailures, clearOtpFailures, loginRetryAfter, otpRetryAfter, recordLoginFailure, recordOtpFailure, takeEmailRequest } from "@/lib/security/attempts";
import { safeInternalPath } from "@/lib/utils";
import { getSession, homePathFor } from "@/lib/auth/session";
import { isSupabaseConfigured, publicEnv } from "@/lib/env";
import { createPublicClient } from "@/lib/supabase/public";
import { createClient } from "@/lib/supabase/server";
import { EMAIL_NOT_CONFIRMED_MESSAGE, signUpErrorMessage } from "./errors";
import {
  candidateEmailSignUpSchema,
  candidateSignUpSchema,
  contactDetailsSchema,
  emailLinkRequestSchema,
  emailLinkSchema,
  newPasswordSchema,
  partnerEmailSignUpSchema,
  partnerSignUpSchema,
  resetRequestSchema,
  signInSchema,
  verifyEmailCodeSchema,
} from "./schemas";
import { forgetPendingEmail, pendingVerification, rememberPendingEmail } from "./verification-cookie";

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
      if (error.code === "email_not_confirmed") {
        // mot de passe correct mais adresse non vérifiée : la page de vérification connaîtra l'adresse
        await rememberPendingEmail(input.email, false, "password");
        return fail(EMAIL_NOT_CONFIRMED_MESSAGE);
      }
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
    // Supabase a envoyé un code de vérification ; même suite si l'adresse a déjà un compte (pas d'énumération)
    await rememberPendingEmail(email, true, "password");
    return { ok: true, data: { redirectTo: "/verification" } };
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
    // code de vérification envoyé ; l'équipe YEN validera ensuite l'organisation
    await rememberPendingEmail(email, true, "password");
    return { ok: true, data: { redirectTo: "/verification" } };
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

/* -----------------------------------------------------------------------------
   Lien magique et code par e-mail (connexion sans mot de passe, inscription, vérification).
   Supabase Auth génère le lien et le code, envoie l'e-mail (SMTP du projet, Resend) et les
   vérifie : le site ne fabrique ni ne contrôle aucun code lui-même.
   ----------------------------------------------------------------------------- */

const LINK_INVALID = "Ce lien n'est plus valable : il a déjà servi, a expiré ou a été remplacé par un e-mail plus récent. Demandez un nouveau lien.";

/** Page de saisie du code, avec la page demandée avant la connexion (chemin interne uniquement). */
const verificationPath = (next: unknown) => {
  const safe = safeInternalPath(next);
  return safe ? `/verification?suivant=${encodeURIComponent(safe)}` : "/verification";
};

/**
 * Envoie un e-mail contenant un lien et un code. `create` : données du compte à créer si l'adresse
 * est inconnue (inscription) ; sans `create`, aucune adresse inconnue ne reçoit d'e-mail (connexion).
 * Retourne un message d'erreur, ou null quand la réponse doit être la même que l'adresse ait un compte ou non.
 */
async function sendLinkAndCode(email: string, create?: Record<string, string>, opts: { resend?: boolean } = {}): Promise<string | null> {
  const wait = takeEmailRequest(await clientIp(), email);
  if (wait) return `Trop de demandes d'e-mail pour cette adresse. Réessayez dans ${minutes(wait)} minute(s).`;
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: Boolean(create), data: create, emailRedirectTo: `${publicEnv.siteUrl}/auth/callback` },
  });
  if (!error) return null;
  // adresse sans compte, en connexion : même réponse qu'avec un compte (pas d'énumération)
  if (error.code === "otp_disabled") return null;
  if (error.code === "over_email_send_rate_limit" && /\d+\s*seconds?/i.test(error.message)) {
    // un e-mail est parti il y a moins d'une minute pour cette adresse : il reste valable
    return opts.resend ? "Un e-mail vient déjà d'être envoyé. Patientez une minute avant d'en demander un nouveau." : null;
  }
  if (isRateLimited(error)) return "Trop de demandes d'e-mail sur la plateforme pour le moment. Réessayez dans quelques minutes.";
  // code seul dans les journaux (jamais l'adresse)
  console.error("[lien e-mail] refus Supabase Auth", error.code, error.status);
  return signUpErrorMessage(error.code) ?? "L'e-mail n'a pas pu être envoyé. Réessayez dans un instant.";
}

/** Connexion sans mot de passe : lien et code envoyés si un compte correspond (réponse identique sinon). */
export async function requestLoginLinkAction(values: Record<string, unknown>): Promise<ActionResult<{ redirectTo: string }>> {
  return runAction<{ redirectTo: string }>({ allowAnonymous: true }, async () => {
    if (!isSupabaseConfigured()) return fail(NOT_CONFIGURED);
    const input = parseInput(emailLinkRequestSchema, values);
    const error = await sendLinkAndCode(input.email);
    if (error) return fail(error);
    await rememberPendingEmail(input.email, true, "login");
    return { ok: true, data: { redirectTo: verificationPath(values.next) } };
  });
}

/**
 * Inscription sans mot de passe (candidat : l'adresse seule ; partenaire : organisation et contact).
 * L'adresse est vérifiée par le lien ou le code reçu. Une adresse déjà inscrite reçoit un lien de
 * connexion à la place, avec la même réponse à l'écran (pas d'énumération des comptes).
 */
export async function signUpWithEmailAction(values: Record<string, unknown>): Promise<ActionResult<{ redirectTo: string }>> {
  return runAction<{ redirectTo: string }>({ allowAnonymous: true }, async () => {
    if (!isSupabaseConfigured()) return fail(NOT_CONFIGURED);
    // conditions d'utilisation acceptées en continuant (mention affichée sous le bouton)
    let email: string;
    let data: Record<string, string>;
    if (values.account_type === "partner") {
      const { email: e, phone, ...org } = parseInput(partnerEmailSignUpSchema, values);
      email = e;
      data = { ...org, ...(phone ? { phone } : {}), account_type: "partner", accepted_terms: "true" };
    } else {
      email = parseInput(candidateEmailSignUpSchema, values).email;
      data = { account_type: "candidate", accepted_terms: "true" };
    }
    const error = await sendLinkAndCode(email, data);
    if (error) return fail(error);
    await rememberPendingEmail(email, true, "signup");
    return { ok: true, data: { redirectTo: "/verification" } };
  });
}

/**
 * Après une vérification réussie : session ouverte, sauf compte désactivé.
 *
 * Préinscription par un tiers : quelqu'un peut créer un compte avec l'adresse d'une autre personne et un
 * mot de passe de son choix, sans pouvoir le confirmer. Si la vraie titulaire confirme ensuite l'adresse
 * (lien ou code), ce mot de passe deviendrait valable. Donc, à la toute première confirmation, un mot de
 * passe qui n'a pas été choisi dans ce navigateur pour cette adresse est remplacé par un mot de passe
 * aléatoire, inconnu de tous : la connexion se fait alors par e-mail (ou « Mot de passe oublié »).
 */
async function afterEmailVerified(supabase: Awaited<ReturnType<typeof createClient>>, next: unknown): Promise<ActionResult<{ redirectTo: string }>> {
  const pending = await pendingVerification();
  const { data } = await supabase.auth.getUser();
  const user = data.user;
  const confirmedAt = user?.email_confirmed_at ? Date.parse(user.email_confirmed_at) : 0;
  const firstConfirmation = Date.now() - confirmedAt < 2 * 60_000;
  const ownPassword = pending.mode === "password" && pending.email === user?.email?.toLowerCase();
  if (user && firstConfirmation && !ownPassword) {
    const { error } = await supabase.auth.updateUser({ password: randomBytes(32).toString("base64url") });
    if (error) console.error("[vérification] mot de passe non remplacé", error.code, error.status);
  }
  await forgetPendingEmail();
  const ctx = await getSession();
  if (ctx && !ctx.profile.is_active) {
    await supabase.auth.signOut();
    return fail("Ce compte est désactivé. Contactez l'équipe YEN.");
  }
  const target = safeInternalPath(next) ?? (ctx ? homePathFor(ctx) : "/connexion?confirme=1");
  return { ok: true, message: "Adresse e-mail vérifiée : bienvenue !", data: { redirectTo: target } };
}

/**
 * Code reçu par e-mail : vérifie l'adresse et ouvre la session (inscription, avec ou sans mot de
 * passe, et connexion sans mot de passe). Le type « email » de Supabase couvre le code d'inscription
 * comme le code de connexion. Échecs limités par compte et par adresse IP, en plus de la limite de Supabase.
 */
export async function verifyEmailCodeAction(values: Record<string, unknown>): Promise<ActionResult<{ redirectTo: string }>> {
  return runAction<{ redirectTo: string }>({ allowAnonymous: true }, async () => {
    if (!isSupabaseConfigured()) return fail(NOT_CONFIGURED);
    const input = parseInput(verifyEmailCodeSchema, values);
    const ip = await clientIp();
    const wait = otpRetryAfter(ip, input.email);
    if (wait) return fail(`Trop de codes erronés. Réessayez dans ${minutes(wait)} minute(s), ou demandez un nouveau code.`);
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ email: input.email, token: input.code, type: "email" });
    if (error) {
      if (isRateLimited(error)) return fail("Trop de vérifications en même temps sur la plateforme. Patientez une minute puis réessayez.");
      if (error.code === "otp_expired" || error.status === 403) {
        recordOtpFailure(ip, input.email);
        return fail("Code incorrect ou expiré. Vérifiez le dernier e-mail reçu (un nouveau code remplace le précédent) ou demandez un nouveau code.");
      }
      console.error("[vérification] refus Supabase Auth", error.code, error.status);
      return fail("La vérification n'a pas pu aboutir. Réessayez dans un instant.");
    }
    clearOtpFailures(ip, input.email);
    return afterEmailVerified(supabase, values.next);
  });
}

/**
 * Lien reçu par e-mail (page /auth/lien) : vérifié seulement après un clic sur « Continuer », pour
 * qu'une messagerie qui ouvre les liens afin de les analyser ne le consomme pas à la place de l'utilisateur.
 */
export async function confirmEmailLinkAction(values: Record<string, unknown>): Promise<ActionResult<{ redirectTo: string }>> {
  return runAction<{ redirectTo: string }>({ allowAnonymous: true }, async () => {
    if (!isSupabaseConfigured()) return fail(NOT_CONFIGURED);
    const parsed = emailLinkSchema.safeParse(values);
    if (!parsed.success) return fail(LINK_INVALID);
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ token_hash: parsed.data.token_hash, type: "email" });
    if (error) {
      if (isRateLimited(error)) return fail("Trop de vérifications en même temps sur la plateforme. Patientez une minute puis réessayez.");
      if (error.code !== "otp_expired" && error.status !== 403) console.error("[lien e-mail] refus Supabase Auth", error.code, error.status);
      return fail(LINK_INVALID);
    }
    return afterEmailVerified(supabase, undefined);
  });
}

/**
 * Renvoie un lien et un code. Compte non vérifié : nouvel e-mail de confirmation ; compte vérifié :
 * lien de connexion ; adresse inconnue : rien. Réponse identique dans tous les cas.
 */
export async function resendEmailCodeAction(values: Record<string, unknown>): Promise<ActionResult> {
  return runAction({ allowAnonymous: true }, async () => {
    if (!isSupabaseConfigured()) return fail(NOT_CONFIGURED);
    const input = parseInput(emailLinkRequestSchema, values);
    const error = await sendLinkAndCode(input.email, undefined, { resend: true });
    if (error) return fail(error);
    const { mode } = await pendingVerification();
    await rememberPendingEmail(input.email, true, mode);
    return { ok: true, message: "Si un compte correspond à cette adresse, un nouvel e-mail vient d'être envoyé. Il remplace le précédent. Pensez à vérifier les courriers indésirables (spams)." };
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
