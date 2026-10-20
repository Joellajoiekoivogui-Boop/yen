"use client";

import { useSyncExternalStore } from "react";

const QUERY = "(prefers-reduced-motion: reduce)";

function subscribe(onChange: () => void) {
  const mq = window.matchMedia(QUERY);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

/** Vrai si l'utilisateur a demandé à réduire les animations (faux au rendu serveur). */
export function useReducedMotion() {
  return useSyncExternalStore(subscribe, () => window.matchMedia(QUERY).matches, () => false);
}
