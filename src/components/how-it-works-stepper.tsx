"use client";

import { useId, useState } from "react";
import { HOW_IT_WORKS_STEPS } from "@/lib/content/how-it-works";
import { useReducedMotion } from "@/lib/use-reduced-motion";
import { cn } from "@/lib/utils";

const STEP_MS = 5500;

/**
 * Parcours candidat en étapes : défilement automatique façon « stories »,
 * clic ou flèches du clavier pour choisir une étape, pause au survol.
 */
export function HowItWorksStepper() {
  const baseId = useId();
  const reduceMotion = useReducedMotion();
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const steps = HOW_IT_WORKS_STEPS;
  const current = steps[active];
  const CurrentIcon = current.icon;
  const auto = !reduceMotion;

  const select = (i: number) => setActive((i + steps.length) % steps.length);

  return (
    <div
      className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_1.1fr] lg:gap-10"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <div role="tablist" aria-label="Étapes du parcours" aria-orientation="vertical" className="flex flex-col gap-2">
        {steps.map((s, i) => {
          const selected = i === active;
          return (
            <button
              key={s.t}
              id={`${baseId}-tab-${i}`}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls={`${baseId}-panel`}
              tabIndex={selected ? 0 : -1}
              onClick={() => select(i)}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown" || e.key === "ArrowRight") {
                  e.preventDefault();
                  select(i + 1);
                  document.getElementById(`${baseId}-tab-${(i + 1) % steps.length}`)?.focus();
                } else if (e.key === "ArrowUp" || e.key === "ArrowLeft") {
                  e.preventDefault();
                  select(i - 1);
                  document.getElementById(`${baseId}-tab-${(i - 1 + steps.length) % steps.length}`)?.focus();
                }
              }}
              className={cn(
                "group relative overflow-hidden rounded-2xl border px-4 py-3 text-left transition-all duration-300",
                selected ? "border-navy-200 bg-white shadow-lg shadow-navy-900/10" : "border-transparent hover:border-border hover:bg-white/70",
              )}
            >
              <span className="flex items-center gap-3">
                <span
                  className={cn(
                    "grid size-8 shrink-0 place-items-center rounded-full font-heading text-sm font-bold transition-all duration-500 ease-spring",
                    selected ? "scale-110 bg-gold-400 text-navy-950" : i < active ? "bg-navy-800 text-white" : "bg-navy-50 text-navy-700",
                  )}
                >
                  {i + 1}
                </span>
                <span className={cn("font-semibold transition-colors", selected ? "text-navy-900" : "text-slate-600 group-hover:text-navy-900")}>{s.t}</span>
              </span>
              {/* barre de progression de l'étape en cours */}
              <span aria-hidden className="absolute inset-x-0 bottom-0 h-0.5 bg-transparent">
                {selected && (
                  <span
                    className={cn("block h-full origin-left bg-gradient-to-r from-navy-700 to-gold-400", auto ? "step-progress" : "w-full")}
                    style={auto ? { animationDuration: `${STEP_MS}ms`, animationPlayState: paused ? "paused" : "running" } : undefined}
                    onAnimationEnd={() => {
                      if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) select(active + 1);
                    }}
                  />
                )}
              </span>
            </button>
          );
        })}
      </div>

      <div
        id={`${baseId}-panel`}
        role="tabpanel"
        aria-labelledby={`${baseId}-tab-${active}`}
        className="relative overflow-hidden rounded-3xl bg-navy-950 p-8 text-white sm:p-10"
      >
        <div aria-hidden className="pointer-events-none absolute -top-24 -right-24 size-72 animate-blob rounded-full bg-gold-400/20 blur-3xl" />
        <div aria-hidden className="pointer-events-none absolute -bottom-28 -left-20 size-72 animate-blob rounded-full bg-electric-500/25 blur-3xl [animation-delay:-8s]" />
        <div key={active} className="relative">
          <p className="animate-slide-down text-sm font-semibold tracking-wide text-gold-300 uppercase">
            Étape {active + 1} sur {steps.length}
          </p>
          <span className="mt-5 grid size-16 animate-pop-in place-items-center rounded-2xl bg-gold-400 text-navy-950 shadow-lg shadow-gold-500/30">
            <CurrentIcon className="size-8" aria-hidden />
          </span>
          <h3 className="mt-6 animate-[reveal-up_0.7s_var(--ease-out-expo)_0.1s_backwards] text-2xl font-bold sm:text-3xl">{current.t}</h3>
          <p className="mt-3 max-w-lg animate-[reveal-up_0.7s_var(--ease-out-expo)_0.2s_backwards] leading-relaxed text-navy-100">{current.d}</p>
          <div className="mt-8 flex gap-1.5" aria-hidden>
            {steps.map((s, i) => (
              <span key={s.t} className={cn("h-1.5 rounded-full transition-all duration-500 ease-out-expo", i === active ? "w-8 bg-gold-400" : "w-1.5 bg-white/25")} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
