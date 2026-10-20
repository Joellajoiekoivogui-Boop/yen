"use client";

import { ArrowUp } from "lucide-react";

/** Bouton « retour en haut » avec anneau de progression de lecture (visible après défilement). */
export function BackToTop() {
  return (
    <button
      type="button"
      className="back-to-top fixed right-4 bottom-4 z-30 grid size-12 place-items-center rounded-full shadow-lg shadow-navy-900/20 transition duration-300 hover:scale-110 sm:right-6 sm:bottom-6"
      aria-label="Revenir en haut de la page"
      onClick={() => {
        const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
      }}
    >
      <span className="grid size-10 place-items-center rounded-full bg-navy-800 text-white">
        <ArrowUp className="size-4" aria-hidden />
      </span>
    </button>
  );
}
