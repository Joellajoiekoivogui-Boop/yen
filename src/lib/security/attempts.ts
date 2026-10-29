import "server-only";
import { createHash } from "node:crypto";

/**
 * Limitation des tentatives sensibles (connexion, demandes d'e-mail) côté serveur.
 *
 * La connexion passe par le serveur : Supabase Auth voit l'adresse du serveur et non celle de
 * l'utilisateur, si bien que sa limite par adresse IP ne cible pas un attaquant (et peut au
 * contraire gêner des utilisateurs légitimes connectés en même temps). On compte donc ici :
 *  - les ÉCHECS par couple (adresse IP, compte) : un attaquant ne bloque que lui-même, jamais
 *    le titulaire du compte qui se connecte depuis une autre adresse ;
 *  - les échecs par adresse IP, avec un plafond plus large (essais sur de nombreux comptes) ;
 *  - les demandes d'e-mail (réinitialisation, renvoi) par adresse IP, pour préserver le quota
 *    d'envoi du projet ;
 *  - les codes de vérification erronés, par couple (adresse IP, compte), par compte toutes
 *    adresses confondues (un code à 6 chiffres ne doit pas pouvoir être essayé en masse depuis
 *    de nombreuses adresses) et par adresse IP.
 * Compteurs en mémoire, par instance du serveur : une protection d'appoint, en plus de celles
 * de Supabase Auth (limites et CAPTCHA réglables dans le tableau de bord).
 */
interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();
const MAX_BUCKETS = 20_000;
const WINDOW_MS = 15 * 60_000;

export const LIMITS = {
  /** échecs de connexion pour un compte depuis une même adresse */
  loginPerAccount: 8,
  /** échecs de connexion depuis une même adresse, tous comptes confondus */
  loginPerIp: 40,
  /** demandes d'e-mail (réinitialisation, renvoi) pour une adresse e-mail depuis une même adresse IP */
  emailPerAccount: 3,
  /** demandes d'e-mail depuis une même adresse IP */
  emailPerIp: 10,
  /** codes de vérification erronés pour un compte depuis une même adresse IP */
  otpPerAccount: 5,
  /** codes de vérification erronés pour un compte, toutes adresses IP confondues */
  otpPerAccountAnyIp: 10,
  /** codes de vérification erronés depuis une même adresse IP, tous comptes confondus */
  otpPerIp: 30,
} as const;

// identifiants hachés : ni adresse e-mail ni IP en clair en mémoire
const key = (...parts: string[]) => createHash("sha256").update(parts.join("\u0000")).digest("base64url").slice(0, 24);

function current(k: string, now: number): Bucket | null {
  const b = buckets.get(k);
  if (!b) return null;
  if (b.resetAt <= now) {
    buckets.delete(k);
    return null;
  }
  return b;
}

function increment(k: string, now: number) {
  const b = current(k, now);
  if (b) b.count++;
  else {
    if (buckets.size >= MAX_BUCKETS) prune(now);
    buckets.set(k, { count: 1, resetAt: now + WINDOW_MS });
  }
}

function prune(now: number) {
  for (const [k, b] of buckets) if (b.resetAt <= now) buckets.delete(k);
  // toujours plein (attaque massive) : on libère les plus anciens
  if (buckets.size >= MAX_BUCKETS) [...buckets.keys()].slice(0, MAX_BUCKETS / 4).forEach((k) => buckets.delete(k));
}

/** Secondes avant de pouvoir réessayer si le plafond est atteint pour l'une des clés, sinon 0. */
function retryAfter(entries: [string, number][], now: number): number {
  let wait = 0;
  for (const [k, max] of entries) {
    const b = current(k, now);
    if (b && b.count >= max) wait = Math.max(wait, Math.ceil((b.resetAt - now) / 1000));
  }
  return wait;
}

const normalizeEmail = (email: string) => email.trim().toLowerCase();

const loginKeys = (ip: string, email: string): [string, number][] => [
  [key("connexion", ip, normalizeEmail(email)), LIMITS.loginPerAccount],
  [key("connexion-ip", ip), LIMITS.loginPerIp],
];

/** Connexion bloquée ? Nombre de secondes à attendre, ou 0. */
export function loginRetryAfter(ip: string, email: string, now = Date.now()): number {
  return retryAfter(loginKeys(ip, email), now);
}

/** Identifiants refusés : compte pour le couple (IP, compte) et pour l'IP. */
export function recordLoginFailure(ip: string, email: string, now = Date.now()) {
  for (const [k] of loginKeys(ip, email)) increment(k, now);
}

/** Connexion réussie : les échecs de ce compte depuis cette adresse sont oubliés. */
export function clearLoginFailures(ip: string, email: string) {
  buckets.delete(loginKeys(ip, email)[0][0]);
}

const otpKeys = (ip: string, email: string): [string, number][] => [
  [key("code", ip, normalizeEmail(email)), LIMITS.otpPerAccount],
  [key("code-compte", normalizeEmail(email)), LIMITS.otpPerAccountAnyIp],
  [key("code-ip", ip), LIMITS.otpPerIp],
];

/** Vérification de code bloquée ? Nombre de secondes à attendre, ou 0. */
export function otpRetryAfter(ip: string, email: string, now = Date.now()): number {
  return retryAfter(otpKeys(ip, email), now);
}

/** Code refusé : compté pour le couple (IP, compte), pour le compte et pour l'IP. */
export function recordOtpFailure(ip: string, email: string, now = Date.now()) {
  for (const [k] of otpKeys(ip, email)) increment(k, now);
}

/** Code accepté : les échecs de ce compte sont oubliés. */
export function clearOtpFailures(ip: string, email: string) {
  for (const [k] of otpKeys(ip, email).slice(0, 2)) buckets.delete(k);
}

/**
 * Demande d'e-mail (réinitialisation, renvoi de confirmation) : comptée, puis refusée au-delà du
 * plafond. Renvoie le nombre de secondes à attendre, ou 0 si la demande peut partir.
 */
export function takeEmailRequest(ip: string, email: string, now = Date.now()): number {
  const entries: [string, number][] = [
    [key("e-mail", ip, normalizeEmail(email)), LIMITS.emailPerAccount],
    [key("e-mail-ip", ip), LIMITS.emailPerIp],
  ];
  const wait = retryAfter(entries, now);
  if (wait) return wait;
  for (const [k] of entries) increment(k, now);
  return 0;
}

/** Réservé aux tests. */
export function resetAttempts() {
  buckets.clear();
}
