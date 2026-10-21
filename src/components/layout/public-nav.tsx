"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { PUBLIC_NAV } from "./public-nav-links";

/** Navigation du site public : la page courante reste soulignée (ordinateur) ou surlignée (mobile). */
export function PublicNav({ variant }: { variant: "desktop" | "mobile" }) {
  const pathname = usePathname();
  const isActive = (href: string) => pathname === href || pathname.startsWith(href + "/");
  const mobileRef = useRef<HTMLElement>(null);

  // mobile : la rangée défile horizontalement, la page courante est ramenée au centre (sinon « Partenaires » est coupé)
  useEffect(() => {
    const nav = mobileRef.current;
    const current = nav?.querySelector<HTMLElement>('[aria-current="page"]');
    if (nav && current) nav.scrollLeft = current.offsetLeft - (nav.clientWidth - current.offsetWidth) / 2;
  }, [pathname]);

  if (variant === "desktop") {
    return (
      <nav className="hidden items-center gap-6 md:flex" aria-label="Navigation publique">
        {PUBLIC_NAV.map((n) => (
          <Link
            key={n.href}
            href={n.href}
            aria-current={isActive(n.href) ? "page" : undefined}
            className="nav-link text-sm font-medium text-slate-600 transition-colors hover:text-navy-900 aria-[current=page]:text-navy-900"
          >
            {n.label}
          </Link>
        ))}
      </nav>
    );
  }
  return (
    <nav ref={mobileRef} className="scroll-fade-x flex gap-1 overflow-x-auto border-t border-border/60 px-3 py-1.5 md:hidden" aria-label="Navigation publique (mobile)">
      {PUBLIC_NAV.map((n) => (
        <Link
          key={n.href}
          href={n.href}
          aria-current={isActive(n.href) ? "page" : undefined}
          className={cn(
            "rounded-full px-3 py-1.5 text-sm whitespace-nowrap transition-colors duration-300",
            isActive(n.href) ? "bg-navy-800 font-medium text-white" : "text-slate-600 active:bg-navy-50",
          )}
        >
          {n.label}
        </Link>
      ))}
    </nav>
  );
}
