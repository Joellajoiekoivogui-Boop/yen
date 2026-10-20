import type { CSSProperties } from "react";

/** Délai d'apparition d'un élément [data-reveal] (en millisecondes). */
export function revealDelay(ms: number): CSSProperties {
  return { "--reveal-delay": `${Math.round(ms)}ms` } as CSSProperties;
}

/** Délai d'une animation CSS classique (animate-*). */
export function animationDelay(ms: number): CSSProperties {
  return { animationDelay: `${Math.round(ms)}ms` };
}
