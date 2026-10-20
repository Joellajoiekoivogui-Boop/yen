import Image from "next/image";
import Link from "next/link";
import logo from "@/assets/brand/yen-logo.png";
import logoWhite from "@/assets/brand/yen-logo-white.png";
import { cn } from "@/lib/utils";

/**
 * Logo officiel du Youth Engineers Network (src/assets/brand) suivi du nom de la plateforme.
 * `inverted` : version blanche et jaune pour les fonds sombres ;
 * `compact` : nom de la plateforme masqué sur les petits écrans (en-tête public).
 */
export function Logo({ href = "/", inverted = false, compact = false, className }: { href?: string; inverted?: boolean; compact?: boolean; className?: string }) {
  return (
    <Link href={href} className={cn("group inline-flex shrink-0 items-center gap-2.5", className)} aria-label="YEN Career Bridge — accueil">
      <Image
        src={inverted ? logoWhite : logo}
        alt=""
        width={88}
        height={40}
        priority
        className="h-10 w-auto transition-transform duration-500 ease-spring group-hover:scale-105"
      />
      <span
        aria-hidden
        className={cn(
          "border-l pl-2.5 font-heading text-[13px] leading-[1.15] font-semibold tracking-tight",
          compact && "hidden sm:block",
          inverted ? "border-white/20 text-white" : "border-navy-100 text-navy-700",
        )}
      >
        Career
        <br />
        <span className={inverted ? "text-gold-300" : "text-gold-600"}>Bridge</span>
      </span>
    </Link>
  );
}
