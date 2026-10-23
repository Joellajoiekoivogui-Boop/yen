import Image, { type StaticImageData } from "next/image";
import type { ReactNode } from "react";
import { BrainCircuit, Code, Cpu, HardHat, Leaf, Wifi, Wrench, Zap } from "lucide-react";
import { MotionToggle } from "@/components/motion/motion-toggle";
import { FloatingIcons, NightSky } from "@/components/motion/sky";
import { cn } from "@/lib/utils";

/** Bandeau sans photo : pictos de l'ingénierie qui flottent dans la moitié droite (ordinateur). */
const FLOATING = [
  { icon: Cpu, x: 62, y: 16, size: 64, depth: 26, dur: 7.5 },
  { icon: Zap, x: 80, y: 10, size: 52, depth: 18, dur: 6.4, delay: 1.5 },
  { icon: Code, x: 90, y: 38, size: 60, depth: 30, dur: 8.2, delay: 3 },
  { icon: Wifi, x: 70, y: 46, size: 50, depth: 14, dur: 6.8, delay: 2.2 },
  { icon: HardHat, x: 58, y: 70, size: 58, depth: 22, dur: 7.8, delay: 4 },
  { icon: Leaf, x: 82, y: 72, size: 48, depth: 16, dur: 6.2, delay: 0.8 },
  { icon: Wrench, x: 94, y: 82, size: 44, depth: 12, dur: 7, delay: 5 },
  { icon: BrainCircuit, x: 50, y: 30, size: 46, depth: 20, dur: 8.6, delay: 2.8 },
];

/**
 * Bandeau d'ouverture des pages du site public (même identité que l'accueil) : quadrillage
 * et halos animés en fond, photo en profondeur qui glisse doucement au défilement.
 * Le titre n'a pas d'animation d'apparition : il est souvent l'élément principal de la page
 * et doit s'afficher immédiatement. Décor : étoiles filantes, scintillements et, sans photo,
 * pictos flottants ; un bouton met ces animations en pause.
 */
export function PageHero({
  eyebrow,
  title,
  description,
  photo,
  photoAlt,
  caption,
  children,
}: {
  eyebrow: string;
  title: ReactNode;
  description: ReactNode;
  photo?: StaticImageData;
  photoAlt?: string;
  caption?: string;
  children?: ReactNode;
}) {
  return (
    <section data-reveal="none" className="relative overflow-hidden bg-navy-950 text-white">
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="hero-grid absolute inset-0" />
        <div className="absolute -top-40 right-[-10%] size-[30rem]">
          <div className="size-full animate-blob rounded-full bg-electric-500/25 blur-3xl" />
        </div>
        <div className="absolute bottom-[-12rem] left-[-8rem] size-[26rem]">
          <div className="size-full animate-blob rounded-full bg-gold-400/15 blur-3xl [animation-delay:-7s]" />
        </div>
        <span className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-gold-300/50 to-transparent" />
      </div>
      <NightSky stars={3} twinkles={5} />
      {!photo && <FloatingIcons items={FLOATING} className="max-lg:hidden" />}
      <div className="pointer-events-none absolute inset-x-0 top-4 z-10">
        <div className="mx-auto flex max-w-7xl justify-end px-4 sm:px-6 lg:px-8">
          <MotionToggle className="pointer-events-auto motion-reduce:hidden" />
        </div>
      </div>

      <div className={cn("relative mx-auto grid max-w-7xl gap-10 px-4 py-14 sm:px-6 lg:px-8 lg:py-20", photo && "lg:grid-cols-[1.1fr_1fr] lg:items-center")}>
        <div className="min-w-0">
          <p className="inline-flex animate-fade-in items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold tracking-wide text-gold-200 uppercase ring-1 ring-white/15">
            <span className="relative flex size-2" aria-hidden>
              <span className="absolute inline-flex size-full animate-ping-slow rounded-full bg-gold-300" />
              <span className="relative inline-flex size-2 rounded-full bg-gold-300" />
            </span>
            {eyebrow}
          </p>
          <h1 className="mt-5 text-[2rem] leading-[1.15] font-bold tracking-tight text-balance sm:text-5xl">{title}</h1>
          <span aria-hidden className="mt-5 block h-1 w-20 origin-left animate-underline rounded-full bg-gradient-to-r from-gold-300 to-electric-400" />
          <div data-reveal="up" className="mt-5 max-w-2xl text-lg text-navy-100">{description}</div>
          {children && <div data-reveal="up" className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap">{children}</div>}
        </div>

        {photo && (
          <div className="hero-depth relative mx-auto w-full max-w-xl lg:max-w-none">
            <div aria-hidden className="absolute -inset-3 -rotate-2 rounded-[2rem] bg-gradient-to-br from-gold-300/30 via-electric-500/20 to-transparent" />
            <figure className="hero-photo-in relative overflow-hidden rounded-3xl ring-1 ring-white/15">
              <Image
                src={photo}
                alt={photoAlt ?? ""}
                preload
                placeholder="blur"
                sizes="(min-width: 1280px) 34rem, (min-width: 1024px) 45vw, 100vw"
                className="aspect-[4/3] h-auto w-full object-cover"
              />
              {caption && (
                <figcaption className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-navy-950/85 to-transparent px-5 pt-12 pb-4 text-sm font-medium text-white/90">
                  {caption}
                </figcaption>
              )}
            </figure>
          </div>
        )}
      </div>
    </section>
  );
}
