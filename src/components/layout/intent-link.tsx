"use client";

import Link from "next/link";
import { useState, type ComponentProps } from "react";

/**
 * Lien qui précharge la page complète dès que l'utilisateur montre son intention
 * (survol, appui, focus clavier) : au clic, la page s'affiche aussitôt.
 * Avant cela, Next.js précharge seulement jusqu'au squelette (loading.tsx).
 */
export function IntentLink({ onMouseEnter, onTouchStart, onFocus, ...props }: ComponentProps<typeof Link>) {
  const [intent, setIntent] = useState(false);
  return (
    <Link
      {...props}
      prefetch={intent ? true : null}
      onMouseEnter={(e) => {
        setIntent(true);
        onMouseEnter?.(e);
      }}
      onTouchStart={(e) => {
        setIntent(true);
        onTouchStart?.(e);
      }}
      onFocus={(e) => {
        setIntent(true);
        onFocus?.(e);
      }}
    />
  );
}
