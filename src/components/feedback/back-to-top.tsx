"use client";

import { ArrowUp } from "lucide-react";

/** Bouton « retour en haut » (visible après défilement). */
export function BackToTop() {
  return (
    <button
      type="button"
      className="back-to-top fixed right-4 bottom-4 z-30 grid size-11 place-items-center rounded-full bg-navy-900 text-white shadow-md transition duration-300 hover:bg-navy-800 sm:right-6 sm:bottom-6"
      aria-label="Revenir en haut de la page"
      onClick={() => {
        const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
      }}
    >
      <ArrowUp className="size-4" aria-hidden />
    </button>
  );
}
