/**
 * Lecture de la boîte de test locale (tests/e2e-stack/mail-sink.mjs) : e-mails envoyés par
 * Supabase Auth pendant les tests, à la place de Resend. Aucun e-mail réel n'est envoyé.
 */
const MAIL = process.env.E2E_MAIL_URL ?? "http://127.0.0.1:54326";

export interface TestMail {
  subject: string;
  text: string;
  /** liens des boutons de l'e-mail */
  links: string[];
}

export async function mailbox(email: string): Promise<TestMail[]> {
  const res = await fetch(`${MAIL}/messages?to=${encodeURIComponent(email.toLowerCase())}`);
  if (!res.ok) throw new Error(`Boîte de test injoignable (${res.status})`);
  return res.json();
}

/** E-mail numéro `count` (1 = premier) reçu pour cette adresse, attendu jusqu'à 15 secondes. */
export async function nthMail(email: string, count = 1): Promise<TestMail> {
  for (let i = 0; i < 60; i++) {
    const mails = await mailbox(email);
    if (mails.length >= count) return mails[count - 1];
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`Aucun e-mail n°${count} reçu`);
}

/** Code (inscription ou connexion) de l'e-mail numéro `count` reçu pour cette adresse. */
export async function verificationCode(email: string, count = 1): Promise<string> {
  const code = /Votre code de (?:vérification|connexion)\s*:?\s*(\d{6,10})/.exec((await nthMail(email, count)).text)?.[1];
  if (!code) throw new Error(`Pas de code dans l'e-mail n°${count}`);
  return code;
}

/** Lien (page /auth/lien du site) de l'e-mail numéro `count` reçu pour cette adresse. */
export async function emailLink(email: string, count = 1): Promise<string> {
  const link = (await nthMail(email, count)).links.find((l) => l.includes("/auth/lien?"));
  if (!link) throw new Error(`Pas de lien dans l'e-mail n°${count}`);
  return link;
}

/** Un code faux, différent du bon. */
export const wrongCode = (code: string) => String((Number(code) + 1) % 10 ** code.length).padStart(code.length, "0");
