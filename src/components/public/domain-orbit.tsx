"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type CSSProperties, type PointerEvent } from "react";
import { ChevronLeft, ChevronRight, Pause, Play } from "lucide-react";
import { DomainIcon } from "@/components/domain-icon";
import { setMotionPaused, useMotionPaused } from "@/components/motion/motion-toggle";
import { useReducedMotion } from "@/lib/use-reduced-motion";
import { cn } from "@/lib/utils";
import { ringIndex, ringOffset } from "./orbit-math";

export interface DomainCardData {
  slug: string;
  name: string;
  short_description: string;
  icon: string;
  occupationCount: number;
  skillCount: number;
}

/** Un cran toutes les 2,4 s : la roue tourne seule en permanence. */
const AUTO_MS = 2400;
/** En dessous de ce nombre de domaines, pas de roue : les cartes s'affichent simplement. */
const MIN_RING = 4;

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * Orbite des domaines d'ingénierie : chaque domaine est un picto sur un anneau, et seuls les trois
 * qui passent sous l'arc doré ont leur carte affichée (jamais plus de trois à la fois).
 * Animations : la roue tourne avec un léger rebond, les pictos restent droits, les cartes roulent
 * comme un barillet, une traînée dorée file autour de l'anneau, le picto central pulse.
 * Contrôles : clic sur un picto, flèches, flèches du clavier, roue attrapée à la souris, glissement
 * du doigt. La rotation automatique (facultative) ne s'arrête pas quand le visiteur fait tourner la
 * roue : elle repart du cran choisi. Elle attend seulement le temps qu'on survole les cartes (pour
 * cliquer celle qu'on vise) ou qu'on parcoure la roue au clavier, s'arrête avec le bouton pause et
 * hors de l'écran, et n'existe pas si l'appareil demande moins d'animations.
 * Toutes les cartes restent dans la page (liens lisibles sans JavaScript).
 */
export function DomainOrbit({
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
  const count = domains.length;
  const step = 360 / Math.max(count, 1);

  // cran courant, sans retour à zéro : la roue tourne toujours dans le sens du mouvement
  const [turn, setTurn] = useState(0);
  // angle de la roue pendant qu'on la fait tourner à la souris
  const [dragAngle, setDragAngle] = useState<number | null>(null);
  // pointeur sur les cartes ou parcours au clavier : la rotation attend
  const [overCards, setOverCards] = useState(false);
  const [keyFocus, setKeyFocus] = useState(false);
  const [inView, setInView] = useState(false);
  const reduceMotion = useReducedMotion();
  const motionPaused = useMotionPaused();
  const rootRef = useRef<HTMLDivElement>(null);
  const nodeRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const drag = useRef<{ cx: number; cy: number; last: number; start: number; moved: number; id: number } | null>(null);
  const dragged = useRef(false);
  const swipe = useRef<{ x: number; y: number } | null>(null);
  const focusCenter = useRef(false);

  const angle = dragAngle ?? -turn * step;
  const center = ringIndex(Math.round(-angle / step), count);
  const stopped = motionPaused;
  const hold = overCards || keyFocus;
  const auto = autoplay && !reduceMotion && !stopped && inView && count >= MIN_RING && dragAngle === null;

  // la roue ne tourne seule que visible à l'écran
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const io = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting), { threshold: 0.3 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // au clavier, le focus suit le picto central
  useEffect(() => {
    if (!focusCenter.current) return;
    focusCenter.current = false;
    nodeRefs.current[center]?.focus({ preventScroll: true });
  }, [center]);

  const go = (target: number, byVisitor: boolean) => {
    if (byVisitor) focusCenter.current = !!document.activeElement?.classList.contains("orbit-node");
    setTurn(target);
  };
  const toggleAuto = () => setMotionPaused(!stopped);

  // souris : on attrape la roue, elle suit le pointeur puis se cale sur le cran le plus proche
  const onDragStart = (e: PointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== "mouse" || e.button !== 0) return;
    const r = e.currentTarget.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    drag.current = { cx, cy, last: Math.atan2(e.clientY - cy, e.clientX - cx), start: -turn * step, moved: 0, id: e.pointerId };
    dragged.current = false;
  };
  const onDragMove = (e: PointerEvent<HTMLDivElement>) => {
    const g = drag.current;
    if (!g) return;
    const a = Math.atan2(e.clientY - g.cy, e.clientX - g.cx);
    let da = a - g.last;
    if (da > Math.PI) da -= 2 * Math.PI;
    else if (da < -Math.PI) da += 2 * Math.PI;
    g.last = a;
    g.moved += (da * 180) / Math.PI;
    if (!dragged.current && Math.abs(g.moved) > 4) {
      dragged.current = true;
      e.currentTarget.setPointerCapture(g.id);
    }
    if (dragged.current) setDragAngle(g.start + g.moved);
  };
  const onDragEnd = () => {
    const g = drag.current;
    drag.current = null;
    if (!g || !dragged.current) return;
    setTurn(Math.round(-(g.start + g.moved) / step));
    setDragAngle(null);
    // le clic qui suit le relâchement ne doit pas choisir un picto
    window.setTimeout(() => (dragged.current = false), 0);
  };

  // doigt : un geste horizontal franc fait tourner d'un cran, le défilement vertical reste libre
  const onSwipeStart = (e: PointerEvent) => {
    if (e.pointerType !== "mouse") swipe.current = { x: e.clientX, y: e.clientY };
  };
  const onSwipeEnd = (e: PointerEvent) => {
    const s = swipe.current;
    swipe.current = null;
    if (!s) return;
    const dx = e.clientX - s.x;
    if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(e.clientY - s.y) * 1.5) go(turn + (dx < 0 ? 1 : -1), true);
  };

  if (count === 0) return null;
  const Heading = headingLevel === 2 ? "h2" : "h3";

  const card = (d: DomainCardData, i: number, slot: number, visible: boolean, isStatic = false) => (
    <Link
      key={d.slug}
      href={`/domaines/${d.slug}`}
      data-slot={slot}
      inert={!visible}
      aria-hidden={!visible || undefined}
      className={cn("orbit-card group", isStatic && "orbit-card-static")}
      style={{ "--s": slot } as CSSProperties}
    >
      {/* numéro du domaine, en filigrane */}
      <span aria-hidden className="pointer-events-none absolute -right-1 -bottom-4 font-heading text-6xl font-bold text-navy-700/60">
        {pad(i + 1)}
      </span>
      <span className="grid size-11 place-items-center rounded-xl bg-gradient-to-br from-gold-300 to-gold-400 text-navy-950">
        <DomainIcon name={d.icon} className="size-5" />
      </span>
      <span className="relative grid min-w-0 gap-0.5">
        <Heading className="line-clamp-2 text-sm leading-snug font-semibold text-white sm:text-base">{d.name}</Heading>
        <span className="line-clamp-2 text-sm leading-snug text-navy-200">{d.short_description}</span>
        <span className="mt-1 text-xs font-medium text-gold-200">
          {d.occupationCount} métiers · {d.skillCount} compétences
        </span>
      </span>
    </Link>
  );

  // liste filtrée très courte : pas de roue, les cartes suffisent
  if (count < MIN_RING) {
    return (
      <div role="region" aria-label={label} className="orbit-stage">
        <div className="grid gap-3">{domains.map((d, i) => card(d, i, 0, true, true))}</div>
      </div>
    );
  }

  const span = Math.min(3 * step, 300);
  const arc = (r: number) => `${(2 * Math.PI * r * span) / 360} 400`;

  return (
    <div
      ref={rootRef}
      role="region"
      aria-roledescription="carrousel"
      aria-label={label}
      className={cn("orbit-stage", dragAngle !== null && "is-dragging")}
      data-paused={motionPaused || undefined}
      data-inview={inView || undefined}
      style={{ touchAction: "pan-y" }}
      onFocus={(e) => {
        // focus au clavier seulement : un clic de souris sur un picto ne doit pas arrêter la roue
        if (e.target.matches(":focus-visible")) setKeyFocus(true);
      }}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setKeyFocus(false);
      }}
      onKeyDown={(e) => {
        if (e.key === "ArrowRight") go(turn + 1, true);
        else if (e.key === "ArrowLeft") go(turn - 1, true);
      }}
      onPointerDown={onSwipeStart}
      onPointerUp={onSwipeEnd}
      onPointerCancel={() => (swipe.current = null)}
    >
      <div className="orbit-layout">
        <div className="orbit-dial" onPointerDown={onDragStart} onPointerMove={onDragMove} onPointerUp={onDragEnd} onPointerCancel={onDragEnd}>
          <div className="orbit-track" aria-hidden>
            <svg viewBox="0 0 100 100">
              <circle className="orbit-track-dots" cx="50" cy="50" r="40" />
              <circle className="orbit-track-outer" cx="50" cy="50" r="47" />
            </svg>
          </div>
          {/* arc doré : les trois domaines qui passent dessous ont leur carte affichée */}
          <div className="orbit-arc" aria-hidden>
            <svg viewBox="0 0 100 100">
              <g transform={`rotate(${-span / 2} 50 50)`}>
                <circle className="orbit-arc-band" cx="50" cy="50" r="40" strokeDasharray={arc(40)} />
                <circle className="orbit-arc-edge" cx="50" cy="50" r="47" strokeDasharray={arc(47)} />
              </g>
            </svg>
          </div>
          <div className="orbit-comet" aria-hidden />
          <div className="orbit-ring" role="group" aria-label="Choisir un domaine" style={{ "--turn": `${angle}deg` } as CSSProperties}>
            {domains.map((d, i) => {
              const off = Math.abs(ringOffset(i, center, count));
              return (
                <button
                  key={d.slug}
                  ref={(el) => {
                    nodeRefs.current[i] = el;
                  }}
                  type="button"
                  className="orbit-node"
                  data-on={off === 0 ? "center" : off === 1 ? "side" : undefined}
                  style={{ "--a": `${i * step}deg` } as CSSProperties}
                  aria-label={`${pad(i + 1)}. ${d.name}`}
                  aria-current={off === 0 ? "true" : undefined}
                  tabIndex={off === 0 ? 0 : -1}
                  onClick={() => {
                    if (!dragged.current) go(turn + ringOffset(i, center, count), true);
                  }}
                >
                  <span className="orbit-node-icon">
                    <DomainIcon name={d.icon} className="size-4.5 lg:size-5" />
                  </span>
                </button>
              );
            })}
          </div>
          <div className="orbit-hub" aria-hidden>
            <span key={center} className="orbit-hub-number">
              {pad(center + 1)}
            </span>
            <span className="orbit-hub-total">sur {count}</span>
          </div>
        </div>

        {/* barillet : la carte du centre et ses deux voisines ; les autres attendent, cachées, au-dessus ou en dessous */}
        <div
          className="orbit-drum"
          onPointerEnter={(e) => e.pointerType === "mouse" && setOverCards(true)}
          onPointerLeave={() => setOverCards(false)}
        >
          {domains.map((d, i) => {
            const off = ringOffset(i, center, count);
            return card(d, i, Math.max(-2, Math.min(2, off)), Math.abs(off) <= 1);
          })}
        </div>
      </div>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => go(turn - 1, true)}
            aria-label="Domaine précédent"
            className="grid size-11 place-items-center rounded-full border border-navy-600 bg-navy-900 text-navy-50 transition duration-300 ease-out-expo hover:border-gold-300 active:scale-95"
          >
            <ChevronLeft className="size-5" aria-hidden />
          </button>
          <button
            type="button"
            onClick={() => go(turn + 1, true)}
            aria-label="Domaine suivant"
            className="grid size-11 place-items-center rounded-full border border-navy-600 bg-navy-900 text-navy-50 transition duration-300 ease-out-expo hover:border-gold-300 active:scale-95"
          >
            <ChevronRight className="size-5" aria-hidden />
          </button>
          <p className="ml-1 hidden text-sm text-navy-200 lg:block">Faites tourner la roue à la souris ou cliquez un picto</p>
        </div>
        {autoplay && !reduceMotion && (
          <div className="flex items-center gap-3">
            {/* temps avant le prochain cran */}
            <span aria-hidden className={cn("block h-1 w-16 overflow-hidden rounded-full bg-navy-700 transition-opacity", !auto && "opacity-40")}>
              {auto && (
                <span
                  key={turn}
                  className="step-progress block h-full origin-left rounded-full bg-gradient-to-r from-gold-300 to-gold-400"
                  style={{ animationDuration: `${AUTO_MS}ms`, animationPlayState: hold ? "paused" : "running" }}
                  onAnimationEnd={(e) => {
                    if (e.animationName === "step-progress") go(turn + 1, false);
                  }}
                />
              )}
            </span>
            <button
              type="button"
              onClick={toggleAuto}
              aria-pressed={stopped}
              aria-label="Mettre en pause la rotation des domaines"
              title={stopped ? "Relancer la rotation" : "Mettre en pause la rotation"}
              className="grid size-9 place-items-center rounded-full border border-navy-600 text-navy-50 transition hover:border-gold-300"
            >
              {stopped ? <Play className="size-4" aria-hidden /> : <Pause className="size-4" aria-hidden />}
            </button>
          </div>
        )}
      </div>
      {/* annonce des domaines affichés (silencieuse tant que la roue tourne seule) */}
      <p className="sr-only" aria-live={auto && !hold ? "off" : "polite"}>
        Domaines affichés : {[-1, 0, 1].map((o) => domains[ringIndex(center + o, count)].name).join(", ")}
      </p>
    </div>
  );
}
