/**
 * Règle unique du mot de passe (inscription, réinitialisation), partagée par le schéma
 * de validation et l'indicateur de solidité : 8 caractères minimum, sans exigence de
 * majuscule ou de symbole (recommandation NIST SP 800-63B), mais les mots de passe
 * les plus courants sont refusés.
 */
export const MIN_PASSWORD_LENGTH = 8;

const COMMON = new Set([
  "12345678", "123456789", "1234567890", "87654321", "11111111", "00000000", "12341234", "11223344",
  "password", "password1", "motdepasse", "motdepasse1", "azertyui", "azertyuiop", "qwertyui", "qwertyuiop",
  "abcd1234", "abc12345", "azerty123", "qwerty123", "iloveyou", "bonjour1", "bonjour123", "guinee224",
  "conakry1", "conakry224", "yen12345", "yencareer", "careerbridge",
]);

/** Vrai pour un mot de passe trop courant ou fait d'un seul caractère répété. */
export function isCommonPassword(value: string): boolean {
  const v = value.trim().toLowerCase();
  return COMMON.has(v) || /^(.)\1+$/.test(v);
}

/** Solidité indicative de 0 à 4 (n'empêche pas l'inscription au-delà de la règle minimale). */
export function passwordStrength(value: string): number {
  if (value.length < MIN_PASSWORD_LENGTH || isCommonPassword(value)) return value ? 1 : 0;
  let score = 2;
  if (value.length >= 12) score++;
  if (/[a-zA-Z]/.test(value) && /\d/.test(value) && (/[^a-zA-Z0-9]/.test(value) || (/[a-z]/.test(value) && /[A-Z]/.test(value)))) score++;
  return score;
}
