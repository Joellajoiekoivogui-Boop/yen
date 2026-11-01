import Image, { type StaticImageData } from "next/image";
import type { ReactNode } from "react";
import { MotionToggle } from "@/components/motion/motion-toggle";
import { NightSky } from "@/components/motion/sky";
import { cn } from "@/lib/utils";

/**
 * Bandeau d'ouverture des pages du site public (même identité que l'accueil) : fond bleu nuit
 * uni avec quelques étoiles d'une seule teinte, photo qui glisse doucement au défilement.
 * Le titre n'a pas d'animation d'apparition : il est souvent l'élément principal de la page
 * et doit s'afficher immédiatement. Un bouton met les animations en pause.
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
      <NightSky stars={3} twinkles={5} />
      <div className="pointer-events-none absolute inset-x-0 top-4 z-10">
        <div className="mx-auto flex max-w-7xl justify-end px-4 sm:px-6 lg:px-8">
          <MotionToggle className="pointer-events-auto motion-reduce:hidden" />
        </div>
      </div>

      <div className={cn("relative mx-auto grid max-w-7xl gap-10 px-4 py-14 sm:px-6 lg:px-8 lg:py-20", photo && "lg:grid-cols-[1.1fr_1fr] lg:items-center")}>
        <div className="min-w-0">
          <p className="text-sm font-semibold tracking-wide text-gold-300 uppercase">{eyebrow}</p>
          <h1 className="mt-3 text-[2rem] leading-[1.15] font-bold tracking-tight text-balance sm:text-5xl">{title}</h1>
          <div data-reveal="up" className="mt-5 max-w-2xl text-lg text-navy-100">{description}</div>
          {children && <div data-reveal="up" className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap">{children}</div>}
        </div>

        {photo && (
          <div className="hero-depth relative mx-auto w-full max-w-xl lg:max-w-none">
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
