import Image from "next/image";
import Link from "next/link";
import type { CSSProperties } from "react";
import { ArrowRight, ArrowUpRight, BadgeCheck, Briefcase, ClipboardCheck, FileText, GraduationCap, Handshake, LineChart, Lock, Rocket, Scale, Search, Sparkles, UserCheck } from "lucide-react";
import { ButtonLink } from "@/components/ui";
import { DomainIcon } from "@/components/domain-icon";
import { HowItWorksStepper } from "@/components/how-it-works-stepper";
import { Constellation } from "@/components/motion/constellation";
import { CountUp } from "@/components/motion/count-up";
import { animationDelay, revealDelay } from "@/components/motion/delay";
import { MotionToggle } from "@/components/motion/motion-toggle";
import { EdgeBeam, FloatingIcons, NightSky } from "@/components/motion/sky";
import { listDomains, referenceDomains } from "@/features/catalog/queries";
import { cn } from "@/lib/utils";
import heroPhoto from "@/assets/hero-ingenieurs.webp";
import amphiPhoto from "@/assets/photos/amphi.jpg";
import communautePhoto from "@/assets/photos/communaute.jpg";
import equipePhoto from "@/assets/photos/equipe-yen.jpg";
import etudiantsPhoto from "@/assets/photos/etudiants.jpg";
import laureatsPhoto from "@/assets/photos/laureats.jpg";
import partenairesPhoto from "@/assets/photos/partenaires.jpg";
import priseDeParolePhoto from "@/assets/photos/prise-de-parole.jpg";
import rencontresPhoto from "@/assets/photos/rencontres.jpg";
import tropheesPhoto from "@/assets/photos/trophees.jpg";

/** Étiquettes posées sur la photo du héros, placées hors des visages (positions en % de la photo). */
const HERO_TAGS = [
  { icon: FileText, t: "Profil complet", d: "CV, projets, certifications", pos: "left-[9%] top-[46%] sm:-left-4 sm:top-[49%]" },
  { icon: ClipboardCheck, t: "Compétences démontrées", d: "prouvées, pas seulement déclarées", pos: "right-[9%] top-[66%] sm:-right-3 sm:top-[63%] lg:right-[5%]" },
  // sur téléphone, deux étiquettes seulement : la troisième couvrirait les personnes
  { icon: Briefcase, t: "Opportunités adaptées", d: "stages, emplois, missions", pos: "left-[14%] bottom-[7%] max-sm:hidden" },
];

const SPACES = [
  {
    icon: UserCheck,
    t: "Étudiants et diplômés",
    photo: etudiantsPhoto,
    alt: "Étudiante concentrée sur son ordinateur portable dans un amphithéâtre, entourée d'autres participants",
    items: ["Profil et CV sécurisés", "Évaluations par domaine", "Recommandations de métiers et plan de progression", "Candidatures et suivi"],
    cta: { href: "/inscription", label: "Créer mon profil" },
  },
  {
    icon: Search,
    t: "Équipe YEN",
    photo: communautePhoto,
    alt: "Trois jeunes hommes souriants portant le t-shirt YEN de l'Africa Engineering Summit",
    items: ["Répertoire des talents filtrable", "Preuves de compétences et analyses explicables", "Présélection et suivi des placements", "Rapports d'insertion"],
    cta: { href: "/connexion", label: "Accéder à mon espace" },
  },
  {
    icon: Handshake,
    t: "Partenaires",
    photo: partenairesPhoto,
    alt: "Panel de quatre intervenants sur scène, entre les affiches de l'Africa Engineering Summit et de Youth Engineers Network",
    items: ["Publication d'offres validées par YEN", "Accès limité aux profils partagés", "Suivi des recrutements", "Retours sur les compétences"],
    cta: { href: "/inscription?type=partenaire", label: "Demander un espace partenaire" },
  },
];

/** Domaines affichés sur l'accueil mobile (la liste complète est sur /domaines). */
const MOBILE_DOMAINS = 6;

const COMMITMENTS = [
  { icon: Lock, t: "Données protégées", d: "Documents privés, accès contrôlés par rôle, consentement explicite avant tout partage avec un partenaire." },
  { icon: Scale, t: "Analyses explicables", d: "Chaque recommandation cite ses sources. Aucune caractéristique sensible n'est utilisée pour classer les candidats." },
  { icon: LineChart, t: "Décision humaine", d: "Les scores de compatibilité aident l'équipe YEN ; la décision finale reste toujours humaine." },
];

/**
 * Photos de l'Africa Engineering Summit. Téléphone : 2 colonnes ; tablette et ordinateur : 3 colonnes,
 * la photo de groupe sur deux colonnes et la prise de parole à sa hauteur.
 */
const GALLERY = [
  {
    photo: laureatsPhoto,
    caption: "Lauréats et participants",
    alt: "Photo de groupe d'une quarantaine de jeunes participants, certificats et trophées en main",
    cell: "col-span-2 aspect-video",
    sizes: "(min-width: 1280px) 50rem, (min-width: 768px) 66vw, 100vw",
  },
  {
    photo: priseDeParolePhoto,
    caption: "Prise de parole",
    alt: "Jeune femme en hijab prenant la parole au micro, l'index levé",
    cell: "aspect-[3/4] md:aspect-auto",
    focus: "object-[50%_0%]",
    sizes: "(min-width: 1280px) 25rem, (min-width: 768px) 33vw, 50vw",
  },
  {
    photo: tropheesPhoto,
    caption: "Remise des trophées",
    alt: "Jeune homme déballant des trophées, dont un trophée en forme de casque de chantier",
    cell: "aspect-[3/4] md:aspect-[4/3]",
    focus: "object-[54%_0%]",
    sizes: "(min-width: 1280px) 25rem, (min-width: 768px) 33vw, 50vw",
  },
  {
    photo: rencontresPhoto,
    caption: "Rencontres",
    alt: "Deux jeunes femmes souriantes, bras croisés, devant les affiches de l'événement",
    cell: "col-span-2 aspect-[16/10] md:col-span-1 md:aspect-[4/3]",
    focus: "object-[50%_20%]",
    sizes: "(min-width: 1280px) 25rem, (min-width: 768px) 33vw, 100vw",
  },
  {
    photo: equipePhoto,
    caption: "Intervenants",
    alt: "Intervenant en costume prenant la parole au micro devant une affiche Youth Engineers Network",
    cell: "col-span-2 aspect-[16/10] md:col-span-1 md:aspect-[4/3]",
    focus: "object-[60%_0%]",
    sizes: "(min-width: 1280px) 25rem, (min-width: 768px) 33vw, 100vw",
  },
];

/** Bulles flottantes posées sur la photo de l'appel à l'action (ordinateur) */
const CTA_FLOATING = [
  { icon: GraduationCap, x: 62, y: 16, size: 60, depth: 24, dur: 7.2, className: "bg-navy-950/45" },
  { icon: BadgeCheck, x: 86, y: 26, size: 52, depth: 16, dur: 6.4, delay: 2, className: "bg-navy-950/45" },
  { icon: Rocket, x: 74, y: 66, size: 56, depth: 28, dur: 8, delay: 3.4, className: "bg-navy-950/45" },
  { icon: Sparkles, x: 92, y: 74, size: 44, depth: 12, dur: 6.8, delay: 1.2, className: "bg-navy-950/45" },
];

/** Mots qui défilent dans le titre (le dernier répète le premier pour une boucle sans saut). */
const ROTATING_WORDS = ["au stage", "à l'emploi", "à l'alternance", "aux missions"];

/** Particules du héros : positions fixes pour un rendu identique serveur / navigateur. */
const PARTICLES = [
  { left: 6, top: 78, size: 3, delay: 0, duration: 7 },
  { left: 14, top: 40, size: 2, delay: 2.4, duration: 9 },
  { left: 22, top: 88, size: 4, delay: 4.1, duration: 8 },
  { left: 31, top: 62, size: 2, delay: 1.2, duration: 10 },
  { left: 39, top: 92, size: 3, delay: 5.5, duration: 7.5 },
  { left: 47, top: 70, size: 2, delay: 3.3, duration: 9.5 },
  { left: 56, top: 85, size: 3, delay: 0.8, duration: 8.5 },
  { left: 63, top: 55, size: 2, delay: 6.2, duration: 9 },
  { left: 71, top: 90, size: 4, delay: 2, duration: 7 },
  { left: 79, top: 66, size: 2, delay: 4.7, duration: 10 },
  { left: 86, top: 82, size: 3, delay: 1.6, duration: 8 },
  { left: 93, top: 48, size: 2, delay: 3.9, duration: 9 },
];

function SectionTitle({ eyebrow, title, description, inverted = false }: { eyebrow: string; title: string; description?: string; inverted?: boolean }) {
  return (
    <div data-reveal-children>
      <p className={inverted ? "text-sm font-semibold tracking-wide text-gold-300 uppercase" : "text-sm font-semibold tracking-wide text-gold-600 uppercase"}>{eyebrow}</p>
      <h2 className={inverted ? "mt-2 text-3xl font-bold tracking-tight text-white sm:text-4xl" : "mt-2 text-3xl font-bold tracking-tight text-navy-900 sm:text-4xl"}>{title}</h2>
      <span aria-hidden className="mt-4 block h-1 w-16 origin-left animate-underline rounded-full bg-gradient-to-r from-navy-700 to-gold-400" />
      {description && <p className={inverted ? "mt-4 max-w-2xl text-navy-200" : "mt-4 max-w-2xl text-muted"}>{description}</p>}
    </div>
  );
}

export default async function HomePage() {
  const domains = await listDomains().catch(() => referenceDomains());
  const totalOccupations = domains.reduce((n, d) => n + d.occupationCount, 0);
  const totalSkills = domains.reduce((n, d) => n + d.skillCount, 0);

  return (
    <>
      {/* Mission */}
      <section
        data-reveal="none"
        data-spotlight
        className="relative overflow-hidden bg-navy-950 text-white"
        style={{ "--spot-color": "rgb(237 180 19 / 0.12)" } as CSSProperties}
      >
        <div aria-hidden className="pointer-events-none absolute inset-0">
          <div className="hero-grid absolute inset-0" />
          <div data-parallax="0.12" className="absolute -top-48 right-[-12%] size-[38rem]">
            <div className="size-full animate-blob rounded-full bg-electric-500/30 blur-3xl" />
          </div>
          <div data-parallax="0.28" className="absolute bottom-[-14rem] left-[-10rem] size-[32rem]">
            <div className="size-full animate-blob rounded-full bg-gold-400/20 blur-3xl [animation-delay:-6s]" />
          </div>
          <div data-parallax="0.2" className="absolute top-1/4 left-1/3 size-[24rem]">
            <div className="size-full animate-blob rounded-full bg-navy-400/25 blur-3xl [animation-delay:-12s]" />
          </div>
          <Constellation />
          <NightSky stars={5} twinkles={6} />
          {PARTICLES.map((p, i) => (
            <span
              key={i}
              // une particule sur deux sur téléphone : chaque boucle d'animation sollicite le fil principal
              className={cn("hero-particle", i % 2 === 1 && "max-sm:hidden")}
              style={{ left: `${p.left}%`, top: `${p.top}%`, width: p.size, height: p.size, "--particle-delay": `${p.delay}s`, "--particle-duration": `${p.duration}s` } as CSSProperties}
            />
          ))}
        </div>

        <div className="relative mx-auto grid max-w-7xl gap-12 px-4 pt-20 pb-28 sm:px-6 lg:grid-cols-[1.15fr_1fr] lg:px-8 lg:pt-28 lg:pb-36">
          <div data-reveal-children>
            <p className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-gold-200 ring-1 ring-white/15">
              <span className="relative flex size-2" aria-hidden>
                <span className="absolute inline-flex size-full animate-ping-slow rounded-full bg-gold-300" />
                <span className="relative inline-flex size-2 rounded-full bg-gold-300" />
              </span>
              Youth Engineers Network · Guinée
            </p>
            <h1 className="mt-5 text-[2.1rem] leading-[1.15] font-bold tracking-tight sm:text-5xl lg:text-[3.4rem]">
              Identifier les talents, renforcer les compétences,{" "}
              <span className="sr-only">ouvrir l&apos;accès au stage et à l&apos;emploi.</span>
              <span aria-hidden className="text-gold-300">
                ouvrir l&apos;accès{" "}
                <span className="word-rotator">
                  {ROTATING_WORDS.map((w, i) => (
                    <span key={w} style={{ "--i": i } as CSSProperties}>
                      <span className="text-shine">{w}</span>
                    </span>
                  ))}
                </span>
              </span>
            </h1>
            <p className="mt-6 max-w-2xl text-lg text-navy-100">
              YEN Career Bridge réunit les profils, les preuves de compétences et les opportunités professionnelles des étudiants et diplômés accompagnés par YEN,
              pour des mises en relation fondées sur ce que chacun sait réellement faire.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              <ButtonLink href="/inscription" variant="accent" size="lg" data-magnetic data-sparkle className="btn-gleam group w-full shadow-lg shadow-gold-500/30 sm:w-auto">
                Créer mon profil <ArrowRight className="size-4 transition-transform duration-300 group-hover:translate-x-1" aria-hidden />
              </ButtonLink>
              <ButtonLink href="/fonctionnement" size="lg" data-magnetic className="w-full bg-white/10 text-white ring-1 ring-white/20 hover:bg-white/20 sm:w-auto">
                Comment ça marche
              </ButtonLink>
            </div>
            {domains.length > 0 && (
              <dl className="mt-12 grid max-w-xl grid-cols-3 gap-4 border-t border-white/10 pt-6">
                {[
                  { value: domains.length, label: "domaines d'ingénierie" },
                  { value: totalOccupations, label: "métiers décrits" },
                  { value: totalSkills, label: "compétences référencées" },
                ].map((s) => (
                  // libellé avant le nombre dans le code (lu une seule fois), affiché sous le nombre
                  <div key={s.label} className="flex flex-col-reverse justify-end">
                    <dt className="mt-1 text-xs text-navy-200 sm:text-sm">{s.label}</dt>
                    <dd>
                      <CountUp value={s.value} className="block font-heading text-3xl font-bold text-gold-300 tabular-nums sm:text-4xl" />
                    </dd>
                  </div>
                ))}
              </dl>
            )}
          </div>

          {/* Photo posée sur le bas du héros, halo et orbites derrière, étiquettes devant */}
          <div className="relative -mb-28 flex items-end justify-center self-end lg:-mb-36">
            <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 mx-auto aspect-square w-full max-w-[34rem] rounded-full lg:max-w-[42rem] bg-[radial-gradient(closest-side,rgb(237_180_19/0.3),rgb(53_101_221/0.22)_55%,transparent)]" />
            <div aria-hidden className="pointer-events-none absolute top-[42%] left-1/2 hidden size-[34rem] -translate-x-1/2 -translate-y-1/2 lg:block xl:size-[40rem]">
              <div className="absolute inset-0 animate-spin-slow rounded-full border border-dashed border-white/10">
                <span className="absolute -top-1.5 left-1/2 size-3 -translate-x-1/2 rounded-full bg-gold-300 shadow-[0_0_18px_4px_rgb(237_180_19/0.6)]" />
              </div>
              <div className="absolute inset-16 animate-spin-reverse rounded-full border border-white/10">
                <span className="absolute -bottom-1 left-1/2 size-2 -translate-x-1/2 rounded-full bg-electric-300 shadow-[0_0_14px_3px_rgb(143_174_247/0.6)]" />
              </div>
            </div>
            {/* photo affichée sans animation d'entrée : c'est l'élément principal du premier écran (LCP) */}
            {/* plus large que sa colonne (toujours centrée) : d'un bord à l'autre sur téléphone, débordante sur ordinateur */}
            {/* profondeur : la photo glisse plus lentement que la page au défilement */}
            <div className="hero-depth relative w-[118%] max-w-none shrink-0 [--depth:48px] sm:w-full sm:max-w-lg lg:w-[118%] lg:max-w-none xl:w-[122%]">
              <Image
                src={heroPhoto}
                alt="Deux jeunes professionnels de l'ingénierie en tenue de sécurité : casques, lunettes de protection et vêtements haute visibilité"
                preload
                sizes="(min-width: 1280px) 44rem, (min-width: 1024px) 50vw, (min-width: 640px) 32rem, 110vw"
                className="h-auto w-full select-none"
                draggable={false}
              />
              {HERO_TAGS.map(({ icon: Icon, t, d, pos }, i) => (
                <div key={t} className={cn("absolute animate-hero-card", pos)} style={animationDelay(650 + i * 160)}>
                  <div className="animate-float" style={animationDelay(-i * 1900)}>
                    <div className="flex items-center gap-2 rounded-2xl bg-navy-950/80 py-1.5 pr-3 pl-1.5 shadow-xl shadow-navy-950/40 ring-1 ring-white/15 sm:gap-3 sm:py-2 sm:pr-4 sm:pl-2">
                      <span className="grid size-7 shrink-0 place-items-center rounded-xl bg-gold-400 text-navy-950 sm:size-9">
                        <Icon className="size-4" aria-hidden />
                      </span>
                      <span className="leading-tight">
                        <span className="block text-xs font-semibold text-white sm:text-sm">{t}</span>
                        <span className="hidden text-xs text-navy-200 sm:block">{d}</span>
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="pointer-events-none absolute inset-x-0 top-4">
          <div className="mx-auto flex max-w-7xl justify-end px-4 sm:px-6 lg:px-8">
            <MotionToggle className="pointer-events-auto motion-reduce:hidden" />
          </div>
        </div>
      </section>

      {/* Bandeau des domaines */}
      {domains.length > 0 && (
        <section data-reveal="none" aria-label="Domaines couverts" className="border-y border-white/10 bg-navy-950 py-4">
          <div className="marquee overflow-hidden">
            <div className="flex w-max animate-marquee">
              {[...domains, ...domains].map((d, i) => (
                <span
                  key={`${d.slug}-${i}`}
                  aria-hidden={i >= domains.length || undefined}
                  className="mr-3 inline-flex items-center gap-2 rounded-full bg-white/5 px-4 py-2 text-sm whitespace-nowrap text-navy-100 ring-1 ring-white/10"
                >
                  <DomainIcon name={d.icon} className="size-4 text-gold-300" />
                  {d.name}
                </span>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Pour qui */}
      <section data-reveal="none" className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8 lg:py-24">
        <SectionTitle eyebrow="Pour qui ?" title="Une plateforme, trois espaces" description="Chaque utilisateur accède uniquement aux informations qui le concernent." />
        <div data-reveal-children className="mt-10 grid grid-cols-1 gap-5 md:grid-cols-3">
          {SPACES.map(({ icon: Icon, t, photo, alt, items, cta }) => (
            <div
              key={t}
              data-spotlight
              data-tilt
              className="group flex flex-col overflow-clip rounded-2xl border border-border bg-white transition duration-500 ease-out-expo hover:-translate-y-1.5 hover:border-electric-200 hover:shadow-2xl hover:shadow-electric-500/10"
            >
              <div className="relative aspect-[2/1] overflow-clip bg-navy-100 md:aspect-[16/10]">
                {/* légère parallaxe au défilement ; le zoom au survol reste sur la photo */}
                <div className="media-parallax absolute inset-0 origin-top [--ps:1.07] [--px:3%]">
                  <Image
                    src={photo}
                    alt={alt}
                    fill
                    placeholder="blur"
                    sizes="(min-width: 1280px) 25rem, (min-width: 768px) 33vw, 100vw"
                    className="object-cover object-top transition-transform duration-700 ease-out-expo group-hover:scale-105"
                  />
                </div>
              </div>
              <div className="flex flex-1 flex-col px-6 pb-6">
                <span className="relative -mt-6 grid size-12 place-items-center rounded-xl bg-gradient-to-br from-navy-50 to-gold-50 text-navy-700 shadow-lg shadow-navy-900/10 ring-4 ring-white transition-transform duration-500 ease-spring group-hover:scale-110 group-hover:-rotate-6">
                  <Icon className="size-5" aria-hidden />
                </span>
                <h3 className="mt-4 text-lg font-semibold text-navy-900">{t}</h3>
                <ul className="mt-3 space-y-2 text-sm text-slate-600">
                  {items.map((item, j) => (
                    <li key={item} className="flex animate-nav-item gap-2" style={animationDelay(350 + j * 90)}>
                      <BadgeCheck className="mt-0.5 size-4 shrink-0 text-gold-600" aria-hidden />
                      {item}
                    </li>
                  ))}
                </ul>
                <Link
                  href={cta.href}
                  className="group/cta mt-auto inline-flex items-center gap-1.5 self-start pt-5 text-sm font-semibold text-electric-700 transition-colors hover:text-navy-900"
                >
                  {cta.label}
                  <ArrowRight className="size-4 transition-transform duration-300 group-hover/cta:translate-x-1" aria-hidden />
                </Link>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Comment ça marche */}
      <section data-reveal="none" className="relative bg-canvas">
        <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8 lg:py-24">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <SectionTitle eyebrow="Comment ça marche" title="Du profil à l'emploi, en 6 étapes" description="Cliquez sur une étape ou laissez le parcours défiler." />
            <div data-reveal="up">
              <ButtonLink href="/fonctionnement" variant="outline" className="group">
                Tout le fonctionnement <ArrowRight className="size-4 transition-transform duration-300 group-hover:translate-x-1" aria-hidden />
              </ButtonLink>
            </div>
          </div>
          <div data-reveal="up" className="mt-10">
            <HowItWorksStepper />
          </div>
        </div>
      </section>

      {/* Engagements */}
      <section data-reveal="none" className="relative overflow-hidden bg-navy-950 text-white">
        <div aria-hidden className="pointer-events-none absolute inset-y-0 left-0 w-[200%] animate-gradient-drift bg-[linear-gradient(120deg,rgb(53_101_221/0.2),transparent_40%,rgb(237_180_19/0.12))]" />
        <NightSky stars={3} twinkles={4} />
        <div className="relative mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
          <SectionTitle eyebrow="Nos engagements" title="Une plateforme digne de confiance" inverted />
          <div data-reveal-children className="mt-10 grid grid-cols-1 gap-6 md:grid-cols-3">
            {COMMITMENTS.map(({ icon: Icon, t, d }, i) => (
              <div
                key={t}
                data-spotlight
                data-tilt
                className="group rounded-2xl bg-white/[0.05] p-6 ring-1 ring-white/10 transition duration-500 ease-out-expo hover:-translate-y-1 hover:bg-white/[0.08]"
                style={{ "--spot-color": "rgb(237 180 19 / 0.1)" } as CSSProperties}
              >
                <span className="relative grid size-12 place-items-center">
                  <span className="absolute inset-0 animate-ping-slow rounded-full bg-gold-400/25" style={animationDelay(i * 600)} aria-hidden />
                  <span className="relative grid size-12 place-items-center rounded-full bg-gold-400/15 text-gold-300 transition-transform duration-500 ease-spring group-hover:scale-110">
                    <Icon className="size-6" aria-hidden />
                  </span>
                </span>
                <h3 className="mt-4 font-semibold">{t}</h3>
                <p className="mt-1 text-sm text-navy-200">{d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* En images */}
      <section data-reveal="none" className="bg-canvas">
        <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8 lg:py-24">
          <SectionTitle
            eyebrow="En images"
            title="La communauté YEN sur le terrain"
            description="Moments de l'Africa Engineering Summit, une initiative de YEN : panels, prises de parole, remise des certificats et des trophées."
          />
          <div className="mt-10 grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3">
            {GALLERY.map(({ photo, caption, alt, cell, focus, sizes }, i) => (
              <figure key={caption} data-reveal="zoom" data-tilt style={revealDelay(i * 80)} className={cn("group relative overflow-clip rounded-2xl bg-navy-100", cell)}>
                <div className="media-parallax absolute inset-0 [--ps:1.12] [--px:5%]">
                  <Image
                    src={photo}
                    alt={alt}
                    fill
                    placeholder="blur"
                    sizes={sizes}
                    className={cn("object-cover transition-transform duration-700 ease-out-expo group-hover:scale-105", focus)}
                  />
                </div>
                <figcaption className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-navy-950/85 via-navy-950/40 to-transparent px-4 pt-10 pb-3 text-sm font-semibold text-white">
                  {caption}
                </figcaption>
              </figure>
            ))}
          </div>
        </div>
      </section>

      {/* Domaines */}
      <section data-reveal="none" className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8 lg:py-24">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <SectionTitle
            eyebrow="Catalogue"
            title={`${domains.length} domaines d'ingénierie`}
            description="Chaque domaine décrit ses métiers, ses compétences avec des critères observables et ses évaluations."
          />
          <div data-reveal="up" className="hidden sm:block">
            <ButtonLink href="/domaines" variant="outline" className="group">
              Voir tous les domaines <ArrowRight className="size-4 transition-transform duration-300 group-hover:translate-x-1" aria-hidden />
            </ButtonLink>
          </div>
        </div>
        <div className="mt-10 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {domains.map((d, i) => (
            <Link
              key={d.slug}
              href={`/domaines/${d.slug}`}
              data-reveal="zoom"
              data-spotlight
              style={revealDelay((i % 3) * 80 + Math.floor(i / 3) * 50)}
              className={cn(
                "group items-start gap-3 overflow-hidden rounded-xl border border-border bg-white p-4 transition duration-300 ease-out-expo hover:-translate-y-1 hover:border-electric-300 hover:shadow-lg hover:shadow-electric-500/10",
                i < MOBILE_DOMAINS ? "flex" : "hidden sm:flex",
              )}
            >
              <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-navy-50 text-navy-700 transition-colors duration-300 group-hover:bg-electric-100 group-hover:text-electric-700">
                <span className="group-hover:animate-bounce-soft">
                  <DomainIcon name={d.icon} className="size-5" />
                </span>
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-navy-900">{d.name}</span>
                <span className="mt-0.5 block text-xs text-muted">{d.short_description}</span>
              </span>
              <ArrowUpRight className="ml-auto size-4 shrink-0 -translate-x-1 text-electric-500 opacity-0 transition duration-300 group-hover:translate-x-0 group-hover:opacity-100" aria-hidden />
            </Link>
          ))}
        </div>
        <ButtonLink href="/domaines" variant="outline" className="group mt-4 w-full sm:hidden">
          Voir les {domains.length} domaines <ArrowRight className="size-4 transition-transform duration-300 group-hover:translate-x-1" aria-hidden />
        </ButtonLink>
      </section>

      {/* Appel à l'action */}
      <section data-reveal="none" className="mx-auto max-w-7xl px-4 pb-24 sm:px-6 lg:px-8">
        <div data-reveal="zoom">
          <div className="relative overflow-hidden rounded-3xl bg-navy-800 text-white">
            <EdgeBeam />
            <span aria-hidden className="absolute inset-y-0 left-0 w-[300%] animate-gradient-drift bg-[linear-gradient(115deg,var(--color-navy-800),var(--color-navy-600),var(--color-electric-600),var(--color-navy-700))] [--drift:-66.667%]" />
            <span aria-hidden className="absolute -top-16 -right-10 size-56 animate-float-slow rounded-full bg-gold-400/15" />
            <span aria-hidden className="absolute -bottom-20 left-1/3 size-44 animate-float rounded-full bg-white/10 [animation-delay:-3s]" />
            <span aria-hidden className="absolute top-8 left-8 hidden size-3 animate-ping-slow rounded-full bg-gold-300 sm:block" />
            <div className="relative grid lg:grid-cols-[1.15fr_1fr]">
              <div className="flex flex-col items-start justify-center gap-6 p-8 sm:p-12">
                <div>
                  <h2 className="text-2xl font-bold sm:text-3xl">Vous êtes accompagné(e) par YEN&nbsp;?</h2>
                  <p className="mt-2 max-w-xl text-white/90">Créez votre profil, faites reconnaître vos compétences et suivez vos candidatures.</p>
                </div>
                <span className="glow-ring">
                  <ButtonLink href="/inscription" variant="accent" size="lg" data-magnetic data-sparkle className="btn-gleam group">
                    Commencer <ArrowRight className="size-4 transition-transform duration-300 group-hover:translate-x-1" aria-hidden />
                  </ButtonLink>
                </span>
              </div>
              <div className="relative order-first aspect-[16/9] sm:aspect-[21/9] lg:order-none lg:aspect-auto lg:min-h-72">
                <Image
                  src={amphiPhoto}
                  alt="Deux jeunes participants attentifs dans un amphithéâtre"
                  fill
                  placeholder="blur"
                  sizes="(min-width: 1280px) 36rem, (min-width: 1024px) 45vw, 100vw"
                  className="object-cover object-[50%_35%] [mask-image:linear-gradient(to_bottom,black_55%,transparent)] lg:[mask-image:linear-gradient(to_right,transparent,black_40%)]"
                />
              </div>
            </div>
            <FloatingIcons items={CTA_FLOATING} className="max-lg:hidden" />
          </div>
        </div>
      </section>
    </>
  );
}
