"use client";

import { useEffect, useSyncExternalStore } from "react";
import { Pause, Play } from "lucide-react";
import { cn } from "@/lib/utils";

const KEY = "yen-animations";
const listeners = new Set<() => void>();
let paused: boolean | null = null;

function read() {
  try {
    return localStorage.getItem(KEY) === "pause";
  } catch {
    return false;
  }
}

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  return () => listeners.delete(onChange);
}

/** Met en pause (ou relance) les animations de la page ; choix mémorisé sur cet appareil quand c'est possible. */
export function setMotionPaused(value: boolean) {
  paused = value;
  try {
    if (value) localStorage.setItem(KEY, "pause");
    else localStorage.removeItem(KEY);
  } catch {
    // stockage indisponible (navigation privée…) : le choix vaut pour la visite en cours
  }
  listeners.forEach((l) => l());
}

/** Vrai si le visiteur a mis les animations en pause (faux au rendu serveur). */
export function useMotionPaused() {
  return useSyncExternalStore(subscribe, () => (paused ??= read()), () => false);
}

/**
 * Bouton pause / lecture des animations continues (bandeau des domaines, mots du titre, décor).
 * Un contenu qui bouge plus de 5 secondes doit pouvoir être arrêté (WCAG 2.2.2), y compris sur
 * mobile où le survol n'existe pas.
 */
export function MotionToggle({ className }: { className?: string }) {
  const isPaused = useMotionPaused();

  useEffect(() => {
    document.documentElement.toggleAttribute("data-motion-paused", isPaused);
    return () => document.documentElement.removeAttribute("data-motion-paused");
  }, [isPaused]);

  return (
    <button
      type="button"
      onClick={() => setMotionPaused(!isPaused)}
      aria-pressed={isPaused}
      aria-label="Mettre les animations en pause"
      title={isPaused ? "Relancer les animations" : "Mettre les animations en pause"}
      className={cn(
        "grid size-10 place-items-center rounded-full bg-white/10 text-white ring-1 ring-white/20 transition hover:bg-white/20 focus-visible:ring-4 focus-visible:ring-gold-300/50 focus-visible:outline-none",
        className,
      )}
    >
      {isPaused ? <Play className="size-4" aria-hidden /> : <Pause className="size-4" aria-hidden />}
    </button>
  );
}
