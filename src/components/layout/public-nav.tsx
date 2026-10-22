"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
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
 * Menu hamburger du site public (téléphone et tablette). Le panneau est déjà dans la page,
 * invisible : l'ouvrir ne fait que le glisser (transform) et éclaircir le fond (opacité).
 * Échap ou un toucher hors du panneau le ferme ; il se ferme aussi au changement de page.
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
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const close = () => setOpenOn(null);

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
        {open ? <X className="size-6" aria-hidden /> : <Menu className="size-6" aria-hidden />}
      </button>
      {/* fermé : invisible (ni focus ni lecteur d'écran), une fois le glissement terminé */}
      <div id="menu-public" className={cn("absolute inset-x-0 top-full lg:hidden", open ? "visible" : "invisible [transition:visibility_0s_linear_200ms]")}>
        <div aria-hidden className={cn("absolute inset-x-0 top-0 h-dvh bg-navy-950/40 transition-opacity duration-200", open ? "opacity-100" : "opacity-0")} onClick={close} />
        <nav
          aria-label="Navigation publique (mobile)"
          className={cn(
            "relative border-b border-border bg-white px-4 pt-3 pb-5 shadow-xl transition-[transform,opacity] duration-200 ease-out sm:px-6",
            open ? "translate-y-0 opacity-100" : "-translate-y-2 opacity-0",
          )}
        >
          <ul className="space-y-1">
            {PUBLIC_NAV.map((n) => {
              const active = isActive(pathname, n.href);
              return (
                <li key={n.href}>
                  <Link
                    href={n.href}
                    onClick={close}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "relative flex items-center rounded-xl px-4 py-3 text-base font-medium transition-colors",
                      "before:absolute before:top-1/2 before:left-0 before:h-6 before:w-1 before:-translate-y-1/2 before:rounded-r-full before:bg-gold-400 before:transition-transform",
                      active ? "bg-navy-50 text-navy-900 before:scale-y-100" : "text-slate-700 before:scale-y-0 active:bg-navy-50",
                    )}
                  >
                    {n.label}
                  </Link>
                </li>
              );
            })}
          </ul>
          <div className="mt-4 grid grid-cols-2 gap-2 border-t border-border pt-4">
            {signedIn ? (
              <Link href="/connexion" onClick={close} className={buttonClass("secondary", "md", "col-span-2")}>
                Mon espace
              </Link>
            ) : (
              <>
                <Link href="/connexion" onClick={close} className={buttonClass("outline", "md")}>
                  Connexion
                </Link>
                <Link href="/inscription" onClick={close} className={buttonClass("secondary", "md")}>
                  Créer un compte
                </Link>
              </>
            )}
          </div>
        </nav>
      </div>
    </>
  );
}
