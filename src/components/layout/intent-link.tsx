"use client";

import Link from "next/link";
import { useEffect, useState, type ComponentProps } from "react";

/**
 * Lien qui précharge la page complète dès que l'utilisateur montre son intention
 * (survol, appui, focus clavier) : au clic, la page s'affiche aussitôt.
 * Avant cela, Next.js précharge seulement jusqu'au squelette (loading.tsx).
 * `eager` : préchargement complet dès que le navigateur est inactif (menu du bas sur
 * téléphone, où il n'y a pas de survol pour anticiper le toucher).
 */
export function IntentLink({ onMouseEnter, onTouchStart, onFocus, eager = false, ...props }: ComponentProps<typeof Link> & { eager?: boolean }) {
  const [intent, setIntent] = useState(false);
  useEffect(() => {
    if (!eager) return;
    const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number; cancelIdleCallback?: (id: number) => void };
    if (w.requestIdleCallback) {
      const id = w.requestIdleCallback(() => setIntent(true), { timeout: 3000 });
      return () => w.cancelIdleCallback?.(id);
    }
    const t = window.setTimeout(() => setIntent(true), 1500);
    return () => window.clearTimeout(t);
  }, [eager]);
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
