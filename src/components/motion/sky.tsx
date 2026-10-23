import type { CSSProperties } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Étoiles filantes et scintillements pour les fonds sombres (décor pur, voir globals.css).
 * Positions fixes : rendu identique serveur / navigateur, aucun script.
 */
/* elles filent du haut à droite vers le bas à gauche (angle de la trajectoire, en degrés) */
const STARS = [
  { x: 70, y: -4, angle: 148, dist: 560, len: 170, dur: 9, delay: 1.2 },
  { x: 92, y: 8, angle: 152, dist: 500, len: 140, dur: 11, delay: 4.6 },
  { x: 48, y: -6, angle: 145, dist: 600, len: 190, dur: 13, delay: 8.1 },
  { x: 100, y: 34, angle: 150, dist: 460, len: 130, dur: 10, delay: 6.3 },
  { x: 82, y: 20, angle: 147, dist: 520, len: 150, dur: 12, delay: 10.4 },
];
const TWINKLES = [
  { x: 8, y: 22, size: 10, dur: 3.4, delay: 0.4 },
  { x: 47, y: 12, size: 8, dur: 2.8, delay: 1.6 },
  { x: 92, y: 64, size: 12, dur: 3.8, delay: 2.2 },
  { x: 30, y: 82, size: 9, dur: 3.1, delay: 0.9 },
  { x: 70, y: 88, size: 7, dur: 2.6, delay: 2.9 },
  { x: 58, y: 48, size: 6, dur: 3.6, delay: 3.4 },
];

export function NightSky({ stars = 3, twinkles = 4, className }: { stars?: number; twinkles?: number; className?: string }) {
  return (
    <div aria-hidden className={cn("pointer-events-none absolute inset-0 overflow-hidden", className)}>
      {STARS.slice(0, stars).map((s, i) => (
        <span
          key={`s${i}`}
          // une étoile sur deux sur téléphone : moins de mouvement sur petit écran
          className={cn("shooting-star", i % 2 === 1 && "max-sm:hidden")}
          style={{ left: `${s.x}%`, top: `${s.y}%`, "--angle": `${s.angle}deg`, "--dist": `${s.dist}px`, "--len": `${s.len}px`, "--dur": `${s.dur}s`, "--delay": `${s.delay}s` } as CSSProperties}
        />
      ))}
      {TWINKLES.slice(0, twinkles).map((t, i) => (
        <span
          key={`t${i}`}
          className={cn("twinkle", i >= 3 && "max-sm:hidden")}
          style={{ left: `${t.x}%`, top: `${t.y}%`, "--size": `${t.size}px`, "--dur": `${t.dur}s`, "--delay": `${t.delay}s` } as CSSProperties}
        />
      ))}
    </div>
  );
}

/** Bordure lumineuse : à placer en premier enfant d'une carte arrondie en position relative. */
export function EdgeBeam({ className }: { className?: string }) {
  return (
    <span aria-hidden className={cn("edge-beam", className)}>
      <i />
      <i />
    </span>
  );
}

/**
 * Pictos en bulles qui flottent et suivent légèrement la souris ([data-depth], moteur d'animation).
 * Chaque entrée : icône, position (%), taille (px), profondeur (amplitude du suivi, px).
 */
export function FloatingIcons({
  items,
  className,
}: {
  items: { icon: LucideIcon; x: number; y: number; size?: number; depth?: number; dur?: number; delay?: number; className?: string }[];
  className?: string;
}) {
  return (
    <div aria-hidden className={cn("pointer-events-none absolute inset-0", className)}>
      {items.map(({ icon: Icon, x, y, size = 56, depth = 18, dur = 7, delay = 0, className: itemClass }, i) => (
        <span
          key={i}
          data-depth={depth}
          className={cn("float-icon", itemClass)}
          style={{ left: `${x}%`, top: `${y}%`, width: size, height: size, "--dur": `${dur}s`, "--delay": `${-delay}s`, "--r0": `${i % 2 ? 6 : -6}deg`, "--r1": `${i % 2 ? -4 : 4}deg` } as CSSProperties}
        >
          <Icon style={{ width: size * 0.44, height: size * 0.44 }} />
        </span>
      ))}
    </div>
  );
}
