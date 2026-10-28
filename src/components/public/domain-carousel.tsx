"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type CSSProperties, type PointerEvent } from "react";
import { ArrowUpRight, ChevronLeft, ChevronRight, Pause, Play } from "lucide-react";
import { DomainIcon } from "@/components/domain-icon";
import { CountUp } from "@/components/motion/count-up";
import { setMotionPaused, useMotionPaused } from "@/components/motion/motion-toggle";
import { useReducedMotion } from "@/lib/use-reduced-motion";
import { cn } from "@/lib/utils";

export interface DomainCardData {
  slug: string;
  name: string;
  short_description: string;
  icon: string;
  occupationCount: number;
  skillCount: number;
}

/** Jamais plus de trois domaines à l'écran : la liste défile par groupes de trois. */
const PER_PAGE = 3;
const AUTO_MS = 6500;
const LEAVE_MS = 450;

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * Carrousel des domaines d'ingénierie, trois à la fois.
 * Animations : les cartes arrivent en cascade du côté où l'on avance (glissement, légère
 * rotation, flou qui se dissipe) pendant que les précédentes s'effacent ; pictos qui flottent ;
 * compteurs de métiers et de compétences qui défilent ; point actif qui se remplit au rythme du
 * défilement automatique.
 * Contrôles : flèches, points, flèches du clavier, glissement du doigt. Le défilement
 * automatique (facultatif) s'arrête au survol, au clavier, dès que le visiteur choisit un
 * groupe, avec le bouton pause, et n'existe pas si l'appareil demande moins d'animations.
 * Toutes les cartes restent dans la page (liens lisibles sans JavaScript et par les moteurs).
 */
export function DomainCarousel({
  domains,
  autoplay = false,
  headingLevel = 3,
  label = "Domaines d'ingénierie",
}: {
  domains: DomainCardData[];
  autoplay?: boolean;
  headingLevel?: 2 | 3;
  label?: string;
}) {
  const pages: DomainCardData[][] = [];
  for (let i = 0; i < domains.length; i += PER_PAGE) pages.push(domains.slice(i, i + PER_PAGE));

  const [page, setPage] = useState(0);
  const [dir, setDir] = useState<1 | -1>(1);
  const [leaving, setLeaving] = useState<number | null>(null);
  const [visits, setVisits] = useState(0);
  const [manual, setManual] = useState(false);
  const [hold, setHold] = useState(false);
  const reduceMotion = useReducedMotion();
  const motionPaused = useMotionPaused();
  const leaveTimer = useRef(0);
  const swipe = useRef<{ x: number; y: number } | null>(null);

  const auto = autoplay && !reduceMotion && !manual && !motionPaused && pages.length > 1;
  const from = page * PER_PAGE + 1;
  const to = Math.min(domains.length, from + PER_PAGE - 1);

  useEffect(() => () => window.clearTimeout(leaveTimer.current), []);

  const go = (target: number, d: 1 | -1, byVisitor: boolean) => {
    const next = (target + pages.length) % pages.length;
    if (next === page) return;
    if (byVisitor) setManual(true);
    setDir(d);
    setLeaving(page);
    setPage(next);
    setVisits((v) => v + 1);
    window.clearTimeout(leaveTimer.current);
    leaveTimer.current = window.setTimeout(() => setLeaving(null), LEAVE_MS);
  };
  const toggleAuto = () => {
    if (auto) setMotionPaused(true);
    else {
      setManual(false);
      setMotionPaused(false);
    }
  };

  // glissement du doigt : un geste horizontal franc change de groupe, le défilement vertical reste libre
  const onPointerDown = (e: PointerEvent) => {
    if (e.pointerType !== "mouse") swipe.current = { x: e.clientX, y: e.clientY };
  };
  const onPointerUp = (e: PointerEvent) => {
    const s = swipe.current;
    swipe.current = null;
    if (!s) return;
    const dx = e.clientX - s.x;
    if (Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(e.clientY - s.y) * 1.5) go(page + (dx < 0 ? 1 : -1), dx < 0 ? 1 : -1, true);
  };

  if (domains.length === 0) return null;
  const Heading = headingLevel === 2 ? "h2" : "h3";

  return (
    <div
      role="region"
      aria-roledescription="carrousel"
      aria-label={label}
      onMouseEnter={() => setHold(true)}
      onMouseLeave={() => setHold(false)}
      onFocus={() => setHold(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setHold(false);
      }}
      onKeyDown={(e) => {
        if (e.key === "ArrowRight") go(page + 1, 1, true);
        else if (e.key === "ArrowLeft") go(page - 1, -1, true);
      }}
    >
      {/* les cartes glissent sur le côté en arrivant : rognées au-delà d'une petite marge (ombres), jamais de défilement horizontal */}
      <div
        className="relative overflow-x-clip [overflow-clip-margin:16px]"
        style={{ touchAction: "pan-y" }}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerCancel={() => (swipe.current = null)}
      >
        {pages.map((group, pi) => {
          const shown = pi === page;
          const isLeaving = pi === leaving && !shown;
          return (
            <div
              key={pi}
              role="group"
              aria-roledescription="groupe"
              aria-label={`Domaines ${pi * PER_PAGE + 1} à ${pi * PER_PAGE + group.length} sur ${domains.length}`}
              hidden={!shown && !isLeaving}
              aria-hidden={isLeaving || undefined}
              inert={isLeaving}
              className={cn("domain-group grid grid-cols-1 gap-4 md:grid-cols-3", isLeaving && "domain-group-leave pointer-events-none absolute inset-x-0 top-0")}
              style={{ "--dir": dir } as CSSProperties}
            >
              {group.map((d, i) => {
                const n = pi * PER_PAGE + i + 1;
                return (
                  <Link
                    key={d.slug}
                    href={`/domaines/${d.slug}`}
                    data-spotlight
                    data-tilt
                    className="domain-card group relative flex flex-col overflow-hidden rounded-2xl border border-border bg-white p-5 transition-[border-color,box-shadow,translate] duration-300 ease-out-expo hover:-translate-y-1 hover:border-electric-200 hover:shadow-xl hover:shadow-electric-500/10"
                    style={{ "--i": i } as CSSProperties}
                  >
                    {/* numéro du domaine, en filigrane */}
                    <span aria-hidden className="pointer-events-none absolute -right-1 -bottom-4 font-heading text-7xl font-bold text-navy-50 transition-colors duration-500 group-hover:text-gold-50">
                      {pad(n)}
                    </span>
                    <div className="relative flex items-start justify-between gap-3">
                      <span className="domain-icon grid size-12 place-items-center rounded-xl bg-gradient-to-br from-navy-50 to-gold-50 text-navy-700 ring-1 ring-navy-100 transition-colors duration-300 group-hover:from-gold-300 group-hover:to-gold-400 group-hover:text-navy-950">
                        <span className="animate-float" style={{ animationDelay: `${-i * 1.3}s` }}>
                          <DomainIcon name={d.icon} className="size-5" />
                        </span>
                      </span>
                      <ArrowUpRight className="size-5 -translate-x-1 text-electric-500 opacity-0 transition duration-300 group-hover:translate-x-0 group-hover:opacity-100" aria-hidden />
                    </div>
                    <Heading className="relative mt-4 font-semibold text-navy-900">{d.name}</Heading>
                    <p className="relative mt-1 line-clamp-2 text-sm text-slate-600">{d.short_description}</p>
                    <div className="relative mt-auto flex gap-2 pt-4 text-xs">
                      {/* compteurs relancés à chaque passage sur le groupe */}
                      <span className="rounded-full bg-navy-50 px-2.5 py-1 font-medium text-navy-700">
                        <CountUp key={shown ? `m${visits}` : "m"} value={d.occupationCount} /> métiers
                      </span>
                      <span className="rounded-full bg-gold-50 px-2.5 py-1 font-medium text-gold-700">
                        <CountUp key={shown ? `c${visits}` : "c"} value={d.skillCount} /> compétences
                      </span>
                    </div>
                  </Link>
                );
              })}
            </div>
          );
        })}
      </div>

      {pages.length > 1 && (
        <div className="mt-6 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => go(page - 1, -1, true)}
              aria-label="Domaines précédents"
              className="grid size-11 place-items-center rounded-full border border-border bg-white text-navy-800 shadow-sm transition duration-300 ease-out-expo hover:-translate-x-0.5 hover:border-electric-300 hover:text-electric-700 active:scale-95"
            >
              <ChevronLeft className="size-5" aria-hidden />
            </button>
            <div className="flex items-center gap-2">
              {pages.map((_, pi) => {
                const active = pi === page;
                return (
                  <button
                    key={pi}
                    type="button"
                    onClick={() => go(pi, pi > page ? 1 : -1, true)}
                    aria-label={`Afficher les domaines ${pi * PER_PAGE + 1} à ${Math.min(domains.length, (pi + 1) * PER_PAGE)}`}
                    aria-current={active ? "true" : undefined}
                    className={cn(
                      "relative h-2.5 overflow-hidden rounded-full transition-all duration-500 ease-out-expo",
                      active ? "w-10 bg-navy-100" : "w-2.5 bg-navy-200 hover:bg-navy-300",
                    )}
                  >
                    {active && (
                      <span
                        aria-hidden
                        className={cn("absolute inset-0 origin-left rounded-full bg-gradient-to-r from-navy-700 to-gold-400", auto && "step-progress")}
                        style={auto ? { animationDuration: `${AUTO_MS}ms`, animationPlayState: hold ? "paused" : "running" } : undefined}
                        onAnimationEnd={(e) => {
                          if (auto && e.animationName === "step-progress") go(page + 1, 1, false);
                        }}
                      />
                    )}
                  </button>
                );
              })}
            </div>
            <button
              type="button"
              onClick={() => go(page + 1, 1, true)}
              aria-label="Domaines suivants"
              className="grid size-11 place-items-center rounded-full border border-border bg-white text-navy-800 shadow-sm transition duration-300 ease-out-expo hover:translate-x-0.5 hover:border-electric-300 hover:text-electric-700 active:scale-95"
            >
              <ChevronRight className="size-5" aria-hidden />
            </button>
          </div>
          <div className="flex items-center gap-3">
            <p className="text-sm text-muted tabular-nums" aria-hidden>
              <span key={page} className="inline-block animate-slide-down font-semibold text-navy-900">
                {pad(from)}–{pad(to)}
              </span>{" "}
              / {pad(domains.length)}
            </p>
            {autoplay && !reduceMotion && (
              <button
                type="button"
                onClick={toggleAuto}
                aria-pressed={!auto}
                aria-label="Mettre en pause le défilement des domaines"
                title={auto ? "Mettre en pause le défilement" : "Relancer le défilement"}
                className="grid size-9 place-items-center rounded-full text-navy-700 transition hover:bg-navy-50"
              >
                {auto ? <Pause className="size-4" aria-hidden /> : <Play className="size-4" aria-hidden />}
              </button>
            )}
          </div>
        </div>
      )}
      {/* annonce du groupe affiché (silencieuse pendant le défilement automatique) */}
      <p className="sr-only" aria-live={auto ? "off" : "polite"}>
        Domaines {from} à {to} sur {domains.length}
      </p>
    </div>
  );
}
