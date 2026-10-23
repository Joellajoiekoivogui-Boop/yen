import type { CSSProperties, ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Titre en mots qui montent l'un après l'autre (le texte reste lu d'un seul tenant). */
function RisingWords({ text }: { text: string }) {
  const words = text.split(" ");
  return words.map((w, i) => (
    <span key={i}>
      <span className="word-mask">
        <span className="word-rise" style={{ "--i": i } as CSSProperties}>{w}</span>
      </span>
      {i < words.length - 1 ? " " : null}
    </span>
  ));
}

/**
 * Titre de section du site public : surtitre doré, titre (mots qui montent l'un après l'autre),
 * trait animé et description facultative.
 * `inverted` pour les fonds sombres. Les enfants s'affichent sous le titre (paragraphes, chiffres)
 * et apparaissent l'un après l'autre comme le reste du bloc.
 */
export function SectionTitle({
  eyebrow,
  title,
  description,
  inverted = false,
  className,
  children,
}: {
  eyebrow: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  inverted?: boolean;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <div data-reveal-children className={className}>
      <p className={cn("text-sm font-semibold tracking-wide uppercase", inverted ? "text-gold-300" : "text-gold-600")}>{eyebrow}</p>
      {/* data-reveal="words" : le titre ne s'efface pas, ses mots montent à son arrivée à l'écran */}
      <h2 data-reveal="words" className={cn("mt-2 text-3xl font-bold tracking-tight text-balance sm:text-4xl", inverted ? "text-white" : "text-navy-900")}>
        {typeof title === "string" ? <RisingWords text={title} /> : title}
      </h2>
      <span
        aria-hidden
        className={cn("mt-4 block h-1 w-16 origin-left animate-underline rounded-full bg-gradient-to-r", inverted ? "from-gold-300 to-electric-400" : "from-navy-700 to-gold-400")}
      />
      {description && <p className={cn("mt-4 max-w-2xl", inverted ? "text-navy-200" : "text-muted")}>{description}</p>}
      {children}
    </div>
  );
}
