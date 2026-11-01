"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { buttonClass } from "@/components/ui";
import { cn } from "@/lib/utils";
import { PUBLIC_NAV } from "./public-nav-links";

const isActive = (pathname: string, href: string) => pathname === href || pathname.startsWith(href + "/");

/** Navigation du site public sur ordinateur : la page courante reste soulignée. */
export function PublicNav() {
  const pathname = usePathname();
  return (
    <nav className="hidden items-center gap-6 lg:flex" aria-label="Navigation publique">
      {PUBLIC_NAV.map((n) => (
        <Link
          key={n.href}
          href={n.href}
          aria-current={isActive(pathname, n.href) ? "page" : undefined}
          className="nav-link text-sm font-medium text-slate-600 transition-colors hover:text-navy-900 aria-[current=page]:text-navy-900"
        >
          {n.label}
        </Link>
      ))}
    </nav>
  );
}

/**
 * Menu hamburger du site public (téléphone et tablette) : une feuille plein écran sous l'en-tête,
 * grands liens séparés par de fines lignes, boutons de connexion en bas. Le panneau est déjà dans
 * la page, invisible : l'ouvrir ne fait que le fondre (opacité) et monter légèrement les liens.
 * Échap le ferme (le focus revient au bouton) ; il se ferme aussi au changement de page. La page
 * ne défile pas derrière tant qu'il est ouvert.
 */
export function PublicMobileMenu({ signedIn }: { signedIn: boolean }) {
  const pathname = usePathname();
  // ouvert pour la page où il a été ouvert : changer de page le referme sans effet supplémentaire
  const [openOn, setOpenOn] = useState<string | null>(null);
  const open = openOn === pathname;
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpenOn(null);
      buttonRef.current?.focus();
    };
    document.addEventListener("keydown", onKey);
    const root = document.documentElement;
    root.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      root.style.overflow = "";
    };
  }, [open]);

  const close = () => setOpenOn(null);
  // les éléments montent l'un après l'autre à l'ouverture, et disparaissent ensemble à la fermeture
  const stagger = (i: number) => ({ transitionDelay: open ? `${60 + i * 35}ms` : "0ms" });
  const item = cn("transition-[translate,opacity] duration-500 ease-out-expo", open ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0");

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpenOn(open ? null : pathname)}
        className="grid size-10 place-items-center rounded-xl text-navy-800 transition-colors hover:bg-navy-50 lg:hidden"
        aria-label={open ? "Fermer le menu" : "Ouvrir le menu"}
        aria-expanded={open}
        aria-controls="menu-public"
      >
        {/* deux traits qui se croisent en « ✕ » à l'ouverture */}
        <span aria-hidden className="relative block h-3 w-5">
          <span className={cn("absolute top-0 left-0 h-0.5 w-5 rounded-full bg-current transition-[translate,rotate] duration-300 ease-out-expo", open && "translate-y-[5px] rotate-45")} />
          <span className={cn("absolute top-[10px] left-0 h-0.5 w-5 rounded-full bg-current transition-[translate,rotate] duration-300 ease-out-expo", open && "-translate-y-[5px] -rotate-45")} />
        </span>
      </button>
      {/* fermé : invisible (ni focus ni lecteur d'écran), une fois le fondu terminé */}
      <div
        id="menu-public"
        className={cn(
          "fixed inset-x-0 top-16 bottom-0 overflow-y-auto bg-white transition-opacity duration-300 ease-out lg:hidden",
          open ? "visible opacity-100" : "invisible opacity-0 [transition:opacity_200ms_ease-out,visibility_0s_linear_200ms]",
        )}
      >
        <nav aria-label="Navigation publique (mobile)" className="mx-auto flex min-h-full max-w-2xl flex-col px-6 pt-4 pb-8 sm:px-8">
          <ul>
            {PUBLIC_NAV.map((n, i) => {
              const active = isActive(pathname, n.href);
              return (
                <li key={n.href} className={cn("border-b border-border/80", item)} style={stagger(i)}>
                  <Link
                    href={n.href}
                    onClick={close}
                    aria-current={active ? "page" : undefined}
                    className="group flex items-center justify-between py-5 font-heading text-2xl font-semibold tracking-tight text-navy-950"
                  >
                    <span className={cn("underline-offset-8", active ? "underline decoration-gold-400 decoration-2" : "group-active:text-navy-700")}>{n.label}</span>
                    <ArrowRight className="size-5 text-slate-400 transition-transform duration-300 group-hover:translate-x-1" aria-hidden />
                  </Link>
                </li>
              );
            })}
          </ul>
          <div className={cn("mt-auto grid gap-3 pt-10", item)} style={stagger(PUBLIC_NAV.length)}>
            {signedIn ? (
              <Link href="/connexion" onClick={close} className={buttonClass("secondary", "lg")}>
                Mon espace
              </Link>
            ) : (
              <>
                <Link href="/inscription" onClick={close} className={buttonClass("secondary", "lg")}>
                  Créer un compte
                </Link>
                <Link href="/connexion" onClick={close} className={buttonClass("outline", "lg")}>
                  Connexion
                </Link>
              </>
            )}
            <p className="pt-3 text-center text-sm text-muted">Youth Engineers Network · Guinée</p>
          </div>
        </nav>
      </div>
    </>
  );
}
