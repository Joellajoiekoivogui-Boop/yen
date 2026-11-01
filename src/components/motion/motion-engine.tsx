"use client";

import { useEffect } from "react";

/** Éléments animés à l'apparition (voir globals.css, section « Motion design »). */
const REVEAL_SELECTOR = "[data-reveal]:not([data-reveal='none']), [data-reveal-children] > :not([data-reveal])";

/**
 * Moteur d'animation global, monté une seule fois dans la mise en page racine.
 * - apparition au défilement : les éléments hors écran sont marqués [data-reveal-pending]
 *   puis révélés à leur arrivée à l'écran (les éléments déjà visibles gardent l'animation CSS
 *   jouée au chargement, sans clignotement) ;
 * - état « page défilée » sur <html> (ombre de l'en-tête, bouton « retour en haut »).
 * Volontairement sobre : aucun effet ne suit le pointeur. Rien n'est animé si l'utilisateur a
 * demandé à réduire les animations.
 */
export function MotionEngine() {
  useEffect(() => {
    const root = document.documentElement;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const cleanups: (() => void)[] = [];

    // Défilement : ombre de l'en-tête et bouton « retour en haut »
    let scrollFrame = 0;
    const updateScroll = () => {
      scrollFrame = 0;
      const y = window.scrollY;
      root.toggleAttribute("data-scrolled", y > 8);
      root.toggleAttribute("data-scrolled-far", y > 700);
    };
    const onScroll = () => {
      if (!scrollFrame) scrollFrame = requestAnimationFrame(updateScroll);
    };
    updateScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    cleanups.push(() => {
      window.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(scrollFrame);
    });

    if (reduceMotion) return () => cleanups.forEach((fn) => fn());
    root.dataset.motion = "on";

    // Apparition au défilement
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.removeAttribute("data-reveal-pending");
          io.unobserve(entry.target);
        }
      },
      { rootMargin: "0px 0px -6% 0px", threshold: 0 },
    );
    // Lectures de position groupées puis écritures groupées : un seul calcul de mise en page
    const consider = (els: Element[]) => {
      const fresh = els.filter((el) => !el.hasAttribute("data-reveal-seen"));
      // seuls les éléments sous l'écran attendent : ceux déjà à l'écran (ou au-dessus) gardent l'animation CSS immédiate
      const offscreen = fresh.filter((el) => el.getBoundingClientRect().top >= window.innerHeight);
      fresh.forEach((el) => el.setAttribute("data-reveal-seen", ""));
      offscreen.forEach((el) => {
        el.setAttribute("data-reveal-pending", "");
        io.observe(el);
      });
    };
    consider([...document.querySelectorAll(REVEAL_SELECTOR)]);
    // Contenu ajouté ensuite (navigation, listes) : traité avant le prochain affichage
    const mo = new MutationObserver((mutations) => {
      const added: Element[] = [];
      for (const m of mutations) {
        m.addedNodes.forEach((node) => {
          if (!(node instanceof Element)) return;
          if (node.matches(REVEAL_SELECTOR)) added.push(node);
          added.push(...node.querySelectorAll(REVEAL_SELECTOR));
        });
      }
      if (added.length) consider(added);
    });
    mo.observe(document.body, { childList: true, subtree: true });
    cleanups.push(() => {
      io.disconnect();
      mo.disconnect();
    });

    return () => {
      delete root.dataset.motion;
      cleanups.forEach((fn) => fn());
    };
  }, []);

  return null;
}
