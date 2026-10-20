"use client";

import { useEffect } from "react";

/** Éléments animés à l'apparition (voir globals.css, section « Motion design »). */
const REVEAL_SELECTOR = "[data-reveal]:not([data-reveal='none']), [data-reveal-children] > :not([data-reveal])";

/**
 * Moteur d'animation global, monté une seule fois dans la mise en page racine.
 * - apparition au défilement : les éléments hors écran sont marqués [data-reveal-pending]
 *   puis révélés à leur arrivée à l'écran (les éléments déjà visibles gardent l'animation CSS
 *   jouée au chargement, sans clignotement) ;
 * - halo qui suit le curseur ([data-spotlight]), inclinaison 3D ([data-tilt]),
 *   boutons magnétiques ([data-magnetic]) et parallaxe ([data-parallax="0.2"]) ;
 * - état « page défilée » et progression de lecture sur <html>.
 * Rien n'est animé si l'utilisateur a demandé à réduire les animations.
 */
export function MotionEngine() {
  useEffect(() => {
    const root = document.documentElement;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
    const cleanups: (() => void)[] = [];

    // Défilement : ombre de l'en-tête, barre de progression et parallaxe
    let scrollFrame = 0;
    const updateScroll = () => {
      scrollFrame = 0;
      const y = window.scrollY;
      root.toggleAttribute("data-scrolled", y > 8);
      root.toggleAttribute("data-scrolled-far", y > 700);
      const max = root.scrollHeight - window.innerHeight;
      root.style.setProperty("--scroll-progress", max > 0 ? (y / max).toFixed(4) : "0");
      if (!reduceMotion) {
        document.querySelectorAll<HTMLElement>("[data-parallax]").forEach((el) => {
          const factor = Number(el.dataset.parallax) || 0.2;
          el.style.transform = `translate3d(0, ${(y * factor).toFixed(1)}px, 0)`;
        });
      }
    };
    const onScroll = () => {
      if (!scrollFrame) scrollFrame = requestAnimationFrame(updateScroll);
    };
    updateScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    cleanups.push(() => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
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
    const consider = (el: Element) => {
      if (el.hasAttribute("data-reveal-seen")) return;
      el.setAttribute("data-reveal-seen", "");
      const rect = el.getBoundingClientRect();
      if (rect.top < window.innerHeight && rect.bottom > 0) return; // déjà à l'écran
      el.setAttribute("data-reveal-pending", "");
      io.observe(el);
    };
    document.querySelectorAll(REVEAL_SELECTOR).forEach(consider);
    // Contenu ajouté ensuite (navigation, listes) : traité avant le prochain affichage
    const mo = new MutationObserver((mutations) => {
      for (const m of mutations) {
        m.addedNodes.forEach((node) => {
          if (!(node instanceof Element)) return;
          if (node.matches(REVEAL_SELECTOR)) consider(node);
          node.querySelectorAll(REVEAL_SELECTOR).forEach(consider);
        });
      }
    });
    mo.observe(document.body, { childList: true, subtree: true });
    cleanups.push(() => {
      io.disconnect();
      mo.disconnect();
    });

    // Effets liés au pointeur (souris uniquement)
    if (finePointer) {
      let pointerFrame = 0;
      let lastEvent: PointerEvent | null = null;
      let tiltEl: HTMLElement | null = null;
      let magneticEl: HTMLElement | null = null;
      const resetTilt = () => {
        if (tiltEl) tiltEl.style.transform = "";
        tiltEl = null;
      };
      const resetMagnetic = () => {
        if (magneticEl) magneticEl.style.translate = "";
        magneticEl = null;
      };
      const applyPointer = () => {
        pointerFrame = 0;
        const ev = lastEvent;
        if (!ev) return;
        const target = ev.target instanceof Element ? ev.target : null;

        const spot = target?.closest<HTMLElement>("[data-spotlight]");
        if (spot) {
          const r = spot.getBoundingClientRect();
          spot.style.setProperty("--mx", `${(ev.clientX - r.left).toFixed(0)}px`);
          spot.style.setProperty("--my", `${(ev.clientY - r.top).toFixed(0)}px`);
        }

        const tilt = target?.closest<HTMLElement>("[data-tilt]") ?? null;
        if (tilt !== tiltEl) resetTilt();
        if (tilt) {
          tiltEl = tilt;
          const r = tilt.getBoundingClientRect();
          const px = (ev.clientX - r.left) / r.width - 0.5;
          const py = (ev.clientY - r.top) / r.height - 0.5;
          tilt.style.transform = `perspective(900px) rotateX(${(-py * 9).toFixed(2)}deg) rotateY(${(px * 11).toFixed(2)}deg) scale(1.02)`;
        }

        const magnetic = target?.closest<HTMLElement>("[data-magnetic]") ?? null;
        if (magnetic !== magneticEl) resetMagnetic();
        if (magnetic) {
          magneticEl = magnetic;
          const r = magnetic.getBoundingClientRect();
          const dx = ev.clientX - (r.left + r.width / 2);
          const dy = ev.clientY - (r.top + r.height / 2);
          magnetic.style.translate = `${(dx * 0.22).toFixed(1)}px ${(dy * 0.3).toFixed(1)}px`;
        }
      };
      const onPointerMove = (ev: PointerEvent) => {
        lastEvent = ev;
        if (!pointerFrame) pointerFrame = requestAnimationFrame(applyPointer);
      };
      const onLeave = () => {
        resetTilt();
        resetMagnetic();
      };
      document.addEventListener("pointermove", onPointerMove, { passive: true });
      root.addEventListener("mouseleave", onLeave);
      cleanups.push(() => {
        document.removeEventListener("pointermove", onPointerMove);
        root.removeEventListener("mouseleave", onLeave);
        cancelAnimationFrame(pointerFrame);
        onLeave();
      });
    }

    return () => {
      delete root.dataset.motion;
      cleanups.forEach((fn) => fn());
    };
  }, []);

  return null;
}
