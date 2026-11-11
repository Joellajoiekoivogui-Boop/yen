import "server-only";
import { randomBytes } from "node:crypto";
import type { createClient } from "@/lib/supabase/server";

/**
 * Préinscription par un tiers : quelqu'un peut créer un compte avec l'adresse d'une autre personne et un
 * mot de passe de son choix, sans pouvoir le confirmer. Si la vraie titulaire confirme ensuite l'adresse
 * (lien, code ou connexion avec Google), ce mot de passe deviendrait valable. Donc, à la toute première
 * confirmation, un mot de passe qui n'a pas été choisi dans ce navigateur pour cette adresse est remplacé
 * par un mot de passe aléatoire, inconnu de tous : la connexion se fait alors par e-mail, par Google, ou
 * après « Mot de passe oublié ».
 *
 * `ownPasswordEmail` : adresse pour laquelle un mot de passe vient d'être choisi dans ce navigateur
 * (formulaire avec mot de passe), ou null.
 */
export async function neutralizeUnprovenPassword(supabase: Awaited<ReturnType<typeof createClient>>, ownPasswordEmail: string | null): Promise<void> {
  const { data } = await supabase.auth.getUser();
  const user = data.user;
  if (!user) return;
  const confirmedAt = user.email_confirmed_at ? Date.parse(user.email_confirmed_at) : 0;
  const firstConfirmation = Date.now() - confirmedAt < 2 * 60_000;
  if (!firstConfirmation || (ownPasswordEmail && ownPasswordEmail === user.email?.toLowerCase())) return;
  const { error } = await supabase.auth.updateUser({ password: randomBytes(32).toString("base64url") });
  if (error) console.error("[vérification] mot de passe non remplacé", error.code, error.status);
}
