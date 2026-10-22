/**
 * Fautes de frappe fréquentes dans le domaine d'une adresse e-mail. L'e-mail de confirmation
 * envoyé à un domaine mal écrit n'arrive jamais et le compte reste bloqué : la faute est
 * signalée avant l'inscription. Liste limitée aux domaines certainement erronés.
 */
const TYPO_DOMAINS: Record<string, string> = {
  "gmail.co": "gmail.com",
  "gmail.con": "gmail.com",
  "gmail.cm": "gmail.com",
  "gmail.om": "gmail.com",
  "gmail.cim": "gmail.com",
  "gmail.comm": "gmail.com",
  "gmail.coom": "gmail.com",
  "gmail.cpm": "gmail.com",
  "gmai.com": "gmail.com",
  "gmial.com": "gmail.com",
  "gamil.com": "gmail.com",
  "gnail.com": "gmail.com",
  "gmaill.com": "gmail.com",
  "gmal.com": "gmail.com",
  "gmeil.com": "gmail.com",
  "gmil.com": "gmail.com",
  "yahoo.con": "yahoo.com",
  "yahoo.cm": "yahoo.com",
  "yaho.com": "yahoo.com",
  "yahooo.com": "yahoo.com",
  "yaho.fr": "yahoo.fr",
  "yahooo.fr": "yahoo.fr",
  "hotmail.con": "hotmail.com",
  "hotmail.cm": "hotmail.com",
  "hotmial.com": "hotmail.com",
  "hotmal.com": "hotmail.com",
  "hotmai.com": "hotmail.com",
  "hotmil.com": "hotmail.com",
  "hotmial.fr": "hotmail.fr",
  "hotmal.fr": "hotmail.fr",
  "outlook.con": "outlook.com",
  "outlok.com": "outlook.com",
  "outloo.com": "outlook.com",
  "outlok.fr": "outlook.fr",
  "icloud.con": "icloud.com",
  "iclod.com": "icloud.com",
  "icoud.com": "icloud.com",
};

/** Adresse corrigée si le domaine est une faute de frappe connue, sinon null. */
export function suggestEmailFix(email: string): string | null {
  const at = email.lastIndexOf("@");
  if (at < 1) return null;
  const fix = TYPO_DOMAINS[email.slice(at + 1).trim().toLowerCase()];
  return fix ? `${email.slice(0, at).trim()}@${fix}` : null;
}
