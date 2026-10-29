/**
 * Lecture de la boîte de test locale (tests/e2e-stack/mail-sink.mjs) : e-mails envoyés par
 * Supabase Auth pendant les tests, à la place de Resend. Aucun e-mail réel n'est envoyé.
 */
const MAIL = process.env.E2E_MAIL_URL ?? "http://127.0.0.1:54326";

export interface TestMail {
  subject: string;
  text: string;
}

export async function mailbox(email: string): Promise<TestMail[]> {
  const res = await fetch(`${MAIL}/messages?to=${encodeURIComponent(email.toLowerCase())}`);
  if (!res.ok) throw new Error(`Boîte de test injoignable (${res.status})`);
  return res.json();
}

/** Code de vérification du e-mail numéro `count` (1 = premier) reçu pour cette adresse. */
export async function verificationCode(email: string, count = 1): Promise<string> {
  for (let i = 0; i < 60; i++) {
    const mails = await mailbox(email);
    const code = mails.length >= count ? /Votre code de vérification\s*:?\s*(\d{6,10})/.exec(mails[count - 1].text)?.[1] : undefined;
    if (code) return code;
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`Aucun code de vérification n°${count} reçu`);
}

/** Un code faux, différent du bon. */
export const wrongCode = (code: string) => String((Number(code) + 1) % 10 ** code.length).padStart(code.length, "0");
