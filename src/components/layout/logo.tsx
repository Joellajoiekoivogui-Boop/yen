import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * Marque textuelle de la plateforme. Il ne s'agit PAS du logo officiel de YEN :
 * remplacer ce composant par le logo fourni par l'organisation.
 */
export function Logo({ href = "/", inverted = false, className }: { href?: string; inverted?: boolean; className?: string }) {
  return (
    <Link href={href} className={cn("inline-flex items-center gap-2 font-bold tracking-tight", className)} aria-label="YEN Career Bridge — accueil">
      <span className="grid size-8 place-items-center rounded-lg bg-gradient-to-br from-electric-500 to-teal-400 text-sm text-white shadow-sm" aria-hidden>
        Y
      </span>
      <span className={cn("text-base", inverted ? "text-white" : "text-navy-900")}>
        YEN <span className={inverted ? "text-teal-300" : "text-electric-600"}>Career Bridge</span>
      </span>
    </Link>
  );
}
