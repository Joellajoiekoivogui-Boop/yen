import "server-only";
import { cookies } from "next/headers";
import { AUTH_COOKIE_OPTIONS } from "@/lib/supabase/cookies";

/**
 * Adresse en attente de vérification, gardée une heure dans un cookie httpOnly (jamais dans
 * l'adresse de la page) pour pré-remplir la page « Vérifiez votre adresse e-mail ».
 * `sentAt` : heure du dernier envoi de code, pour le délai avant de pouvoir en redemander un.
 */
const NAME = "yen-verification";
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export async function rememberPendingEmail(email: string, codeJustSent: boolean) {
  const sentAt = codeJustSent ? Math.floor(Date.now() / 1000) : 0;
  (await cookies()).set(NAME, `${sentAt}:${email}`, { ...AUTH_COOKIE_OPTIONS, maxAge: 60 * 60 });
}

/**
 * Délai avant de pouvoir redemander un code : le même que l'intervalle minimal de Supabase entre deux
 * e-mails pour une même adresse (60 s par défaut ; AUTH_RESEND_DELAY_S s'il a été modifié).
 */
export const RESEND_DELAY_S = Math.min(600, Math.max(0, Number(process.env.AUTH_RESEND_DELAY_S ?? 60) || 0));

/** Adresse en attente et secondes restantes avant de pouvoir redemander un code. */
export async function pendingVerification(): Promise<{ email: string; resendIn: number }> {
  const raw = (await cookies()).get(NAME)?.value ?? "";
  const i = raw.indexOf(":");
  const email = raw.slice(i + 1);
  const sentAt = Number(raw.slice(0, i));
  if (i < 0 || email.length > 254 || !EMAIL.test(email) || !Number.isFinite(sentAt)) return { email: "", resendIn: 0 };
  return { email, resendIn: Math.max(0, Math.min(RESEND_DELAY_S, sentAt + RESEND_DELAY_S - Math.floor(Date.now() / 1000))) };
}

export async function forgetPendingEmail() {
  (await cookies()).delete(NAME);
}
