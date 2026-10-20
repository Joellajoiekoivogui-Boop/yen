"use client";

import { useSyncExternalStore } from "react";
import { ButtonLink } from "@/components/ui";

const SESSION_COOKIE = /(?:^|;\s*)sb-[^=;]+-auth-token(?:\.\d+)?=/;
const noopSubscribe = () => () => {};

/**
 * Boutons de l'en-tête public. Les pages publiques restent statiques (servies
 * depuis le cache) : la présence d'une session est détectée dans le navigateur.
 * « Mon espace » passe par la connexion, qui redirige vers l'espace du compte.
 */
export function HeaderAuth() {
  const signedIn = useSyncExternalStore(noopSubscribe, () => SESSION_COOKIE.test(document.cookie), () => false);
  if (signedIn) return <ButtonLink href="/connexion" variant="secondary" size="sm">Mon espace</ButtonLink>;
  return (
    <>
      <ButtonLink href="/connexion" variant="ghost" size="sm">Connexion</ButtonLink>
      <ButtonLink href="/inscription" variant="secondary" size="sm" data-magnetic>Créer un compte</ButtonLink>
    </>
  );
}
