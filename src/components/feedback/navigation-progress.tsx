"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef } from "react";

/**
 * Barre de progression en haut de l'écran pendant le chargement d'une page :
 * démarre au clic sur un lien interne, se termine quand la nouvelle page est affichée.
 */
export function NavigationProgress() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const barRef = useRef<HTMLDivElement>(null);
  const safetyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const finish = () => {
      const bar = barRef.current;
      if (!bar || bar.dataset.state !== "loading") return;
      bar.dataset.state = "done";
    };
    const onClick = (ev: MouseEvent) => {
      if (ev.defaultPrevented || ev.button !== 0 || ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey) return;
      const link = ev.target instanceof Element ? ev.target.closest("a[href]") : null;
      if (!(link instanceof HTMLAnchorElement) || link.target === "_blank" || link.hasAttribute("download")) return;
      const url = new URL(link.href, window.location.href);
      if (url.origin !== window.location.origin || url.pathname.startsWith("/api/") || url.pathname.startsWith("/auth/")) return;
      if (url.pathname === window.location.pathname && url.search === window.location.search) return;
      const bar = barRef.current;
      if (!bar) return;
      bar.dataset.state = "idle";
      void bar.offsetWidth; // relance l'animation
      bar.dataset.state = "loading";
      if (safetyTimer.current) clearTimeout(safetyTimer.current);
      safetyTimer.current = setTimeout(finish, 12000);
    };
    document.addEventListener("click", onClick, true);
    return () => {
      document.removeEventListener("click", onClick, true);
      if (safetyTimer.current) clearTimeout(safetyTimer.current);
    };
  }, []);

  // Nouvelle page affichée : la barre se termine
  useEffect(() => {
    const bar = barRef.current;
    if (bar?.dataset.state === "loading") bar.dataset.state = "done";
  }, [pathname, searchParams]);

  return <div ref={barRef} data-state="idle" className="nav-progress" aria-hidden />;
}
