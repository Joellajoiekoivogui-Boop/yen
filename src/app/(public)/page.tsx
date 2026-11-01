import Image from "next/image";
import Link from "next/link";
import { ArrowRight, BadgeCheck, Handshake, LineChart, Lock, Scale, Search, UserCheck } from "lucide-react";
import { ButtonLink } from "@/components/ui";
import { DomainIcon } from "@/components/domain-icon";
import { HowItWorksStepper } from "@/components/how-it-works-stepper";
import { Constellation } from "@/components/motion/constellation";
import { CountUp } from "@/components/motion/count-up";
import { revealDelay } from "@/components/motion/delay";
import { MotionToggle } from "@/components/motion/motion-toggle";
import { NightSky } from "@/components/motion/sky";
import { DomainOrbit } from "@/components/public/domain-orbit";
import { SectionTitle } from "@/components/public/section-title";
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

const SPACES = [
  {
    icon: UserCheck,
    t: "Étudiants et diplômés",
    photo: etudiantsPhoto,
    alt: "Étudiante concentrée sur son ordinateur portable dans un amphithéâtre, entourée d'autres participants",
    items: ["Profil et CV sécurisés", "Entretiens par domaine", "Recommandations de métiers et plan de progression", "Candidatures et suivi"],
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

export default async function HomePage() {
  const domains = await listDomains().catch(() => referenceDomains());
  const totalOccupations = domains.reduce((n, d) => n + d.occupationCount, 0);
  const totalSkills = domains.reduce((n, d) => n + d.skillCount, 0);

  return (
    <>
      {/* Mission */}
      <section data-reveal="none" className="relative overflow-hidden bg-navy-950 text-white">
        {/* décor discret : constellation et quelques étoiles, d'une seule teinte */}
        <div aria-hidden className="pointer-events-none absolute inset-0">
          <Constellation />
          <NightSky stars={3} twinkles={5} />
        </div>

        <div className="relative mx-auto grid max-w-7xl gap-12 px-4 pt-16 pb-28 sm:px-6 sm:pt-20 lg:grid-cols-[1.15fr_1fr] lg:px-8 lg:pt-28 lg:pb-36">
          <div data-reveal-children>
            {/* titre affiché d'emblée, sans animation d'entrée : c'est l'élément principal du premier écran */}
            <h1 data-reveal="none" className="hero-title text-[2.1rem] leading-[1.12] font-bold tracking-tight text-balance sm:text-5xl lg:text-[3.4rem]">
              Identifier les talents, renforcer les compétences, <span className="text-gold-300">ouvrir l&apos;accès au stage et à l&apos;emploi.</span>
            </h1>
            <p className="mt-6 max-w-2xl text-lg text-navy-100">
              YEN Career Bridge réunit les profils, les preuves de compétences et les opportunités professionnelles des étudiants et diplômés accompagnés par YEN,
              pour des mises en relation fondées sur ce que chacun sait réellement faire.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              <ButtonLink href="/inscription" variant="accent" size="lg" className="group w-full sm:w-auto">
                Créer mon profil <ArrowRight className="size-4 transition-transform duration-300 group-hover:translate-x-1" aria-hidden />
              </ButtonLink>
              <ButtonLink href="/fonctionnement" size="lg" className="w-full bg-transparent text-white ring-1 ring-white/25 hover:bg-white/10 sm:w-auto">
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
                      <CountUp value={s.value} className="block font-heading text-3xl font-bold text-white tabular-nums sm:text-4xl" />
                    </dd>
                  </div>
                ))}
              </dl>
            )}
          </div>

          {/* Photo posée sur le bas du héros : l'image parle d'elle-même, sans étiquettes ni halo */}
          <div className="relative -mb-28 flex items-end justify-center self-end lg:-mb-36">
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
                  className="mr-8 inline-flex items-center gap-2 py-1 text-sm whitespace-nowrap text-navy-200"
                >
                  <DomainIcon name={d.icon} className="size-4 text-navy-300" />
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
              className="group flex flex-col overflow-clip rounded-2xl border border-border bg-white transition duration-300 ease-out-expo hover:-translate-y-1 hover:border-navy-200 hover:shadow-md"
            >
              <div className="photo-curtain relative aspect-[2/1] overflow-clip bg-navy-100 md:aspect-[16/10]">
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
                <span className="relative -mt-6 grid size-12 place-items-center rounded-xl bg-navy-50 text-navy-700 ring-4 ring-white">
                  <Icon className="size-5" aria-hidden />
                </span>
                <h3 className="mt-4 text-lg font-semibold text-navy-900">{t}</h3>
                <ul className="mt-3 space-y-2 text-sm text-slate-600">
                  {items.map((item) => (
                    <li key={item} className="flex gap-2">
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
      <section data-reveal="none" className="bg-navy-950 text-white">
        <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
          <SectionTitle eyebrow="Nos engagements" title="Une plateforme digne de confiance" inverted />
          <div data-reveal-children className="mt-10 grid grid-cols-1 gap-6 md:grid-cols-3">
            {COMMITMENTS.map(({ icon: Icon, t, d }) => (
              <div key={t} className="rounded-2xl p-6 ring-1 ring-white/10">
                <span className="grid size-11 place-items-center rounded-xl text-gold-300 ring-1 ring-white/15">
                  <Icon className="size-5" aria-hidden />
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
              <figure key={caption} data-reveal="curtain" style={revealDelay(i * 80)} className={cn("group relative overflow-clip rounded-2xl bg-navy-100", cell)}>
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
            description="Chaque domaine décrit ses métiers, ses compétences avec des critères observables et ses entretiens."
          />
          <div data-reveal="up" className="hidden sm:block">
            <ButtonLink href="/domaines" variant="outline" className="group">
              Voir tous les domaines <ArrowRight className="size-4 transition-transform duration-300 group-hover:translate-x-1" aria-hidden />
            </ButtonLink>
          </div>
        </div>
        {/* orbite : quinze pictos sur un anneau, trois domaines affichés à la fois au lieu d'une grille de quinze cartes */}
        <div data-reveal="up" className="mt-10">
          <DomainOrbit
            autoplay
            domains={domains.map((d) => ({ slug: d.slug, name: d.name, short_description: d.short_description, icon: d.icon, occupationCount: d.occupationCount, skillCount: d.skillCount }))}
          />
        </div>
        <ButtonLink href="/domaines" variant="outline" className="group mt-6 w-full sm:hidden">
          Voir les {domains.length} domaines <ArrowRight className="size-4 transition-transform duration-300 group-hover:translate-x-1" aria-hidden />
        </ButtonLink>
      </section>

      {/* Appel à l'action */}
      <section data-reveal="none" className="mx-auto max-w-7xl px-4 pb-24 sm:px-6 lg:px-8">
        <div data-reveal="zoom">
          <div className="overflow-hidden rounded-3xl bg-navy-900 text-white">
            <div className="grid lg:grid-cols-[1.15fr_1fr]">
              <div className="flex flex-col items-start justify-center gap-6 p-8 sm:p-12">
                <div>
                  <h2 className="text-2xl font-bold sm:text-3xl">Vous êtes accompagné(e) par YEN&nbsp;?</h2>
                  <p className="mt-2 max-w-xl text-white/90">Créez votre profil, faites reconnaître vos compétences et suivez vos candidatures.</p>
                </div>
                <ButtonLink href="/inscription" variant="accent" size="lg" className="group">
                  Commencer <ArrowRight className="size-4 transition-transform duration-300 group-hover:translate-x-1" aria-hidden />
                </ButtonLink>
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
          </div>
        </div>
      </section>
    </>
  );
}
