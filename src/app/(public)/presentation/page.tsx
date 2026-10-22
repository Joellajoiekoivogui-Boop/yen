import type { Metadata } from "next";
import Image from "next/image";
import type { CSSProperties } from "react";
import { ArrowRight, BadgeCheck, Briefcase, ClipboardCheck, Compass, FolderLock, LineChart, Lock, Scale, Search, UserCheck } from "lucide-react";
import { ButtonLink } from "@/components/ui";
import { CountUp } from "@/components/motion/count-up";
import { animationDelay } from "@/components/motion/delay";
import { PageHero } from "@/components/public/page-hero";
import { listDomains, referenceDomains } from "@/features/catalog/queries";
import laureatsPhoto from "@/assets/photos/laureats.jpg";
import rencontresPhoto from "@/assets/photos/rencontres.jpg";

export const metadata: Metadata = { title: "Présentation" };

const FEATURES = [
  { icon: FolderLock, t: "Un dossier sécurisé", d: "CV, diplômes, certifications, projets et expériences de chaque bénéficiaire réunis dans un espace personnel protégé." },
  { icon: ClipboardCheck, t: "Des compétences évaluées", d: "Questionnaires, exercices, études de cas et évaluations humaines, sur les compétences techniques et transversales." },
  { icon: BadgeCheck, t: "Déclaré ou démontré", d: "Les compétences déclarées restent distinctes des compétences démontrées, toujours accompagnées de leurs preuves." },
  { icon: Compass, t: "Des métiers compatibles", d: "Des métiers proposés selon le profil, avec un score expliqué et un plan de progression personnalisé." },
  { icon: Briefcase, t: "Offres et candidatures", d: "Offres de stage, d'emploi, d'alternance et de mission, candidatures, entretiens et placements suivis au même endroit." },
  { icon: LineChart, t: "Un impact mesuré", d: "L'insertion professionnelle mesurée sur des périodes et des définitions explicites, pour rendre compte de l'action de YEN." },
];

const PRINCIPLES = [
  { icon: Lock, t: "Confidentialité", d: "Un candidat ne voit que ses propres données ; un partenaire ne voit que les profils partagés avec le consentement des candidats." },
  { icon: Search, t: "Explicabilité", d: "Chaque score et chaque analyse indiquent leurs sources et leur niveau de confiance." },
  { icon: Scale, t: "Équité", d: "Aucune caractéristique sensible (photo, sexe, origine, religion, situation familiale) n'est utilisée pour classer les candidats." },
  { icon: UserCheck, t: "Contrôle humain", d: "L'intelligence artificielle assiste ; les décisions appartiennent à l'équipe YEN et aux recruteurs." },
];

export default async function PresentationPage() {
  const domains = await listDomains().catch(() => referenceDomains());
  const occupations = domains.reduce((n, d) => n + d.occupationCount, 0);
  const skills = domains.reduce((n, d) => n + d.skillCount, 0);

  return (
    <>
      <PageHero
        eyebrow="Présentation"
        title="YEN Career Bridge"
        description={
          <p>
            Le Youth Engineers Network (YEN) accompagne des étudiants, des apprenants et des diplômés dans leurs formations techniques et professionnelles.
            YEN Career Bridge est sa plateforme de gestion des talents et d&apos;insertion professionnelle.
          </p>
        }
        photo={laureatsPhoto}
        photoAlt="Photo de groupe d'une quarantaine de jeunes participants, certificats et trophées en main"
        caption="Lauréats et participants de l'Africa Engineering Summit, une initiative de YEN"
      >
        <ButtonLink href="/inscription" variant="accent" size="lg" data-magnetic className="group w-full shadow-lg shadow-gold-500/30 sm:w-auto">
          Créer un compte <ArrowRight className="size-4 transition-transform duration-300 group-hover:translate-x-1" aria-hidden />
        </ButtonLink>
        <ButtonLink href="/fonctionnement" size="lg" data-magnetic className="w-full bg-white/10 text-white ring-1 ring-white/20 hover:bg-white/20 sm:w-auto">
          Voir le fonctionnement
        </ButtonLink>
      </PageHero>

      {/* Pourquoi */}
      <section data-reveal="none" className="mx-auto grid max-w-7xl gap-12 overflow-x-clip px-4 py-20 sm:px-6 lg:grid-cols-2 lg:items-center lg:px-8 lg:py-24">
        <div data-reveal-children className="min-w-0">
          <p className="text-sm font-semibold tracking-wide text-gold-600 uppercase">Pourquoi cette plateforme ?</p>
          <h2 className="mt-2 text-3xl font-bold tracking-tight text-balance text-navy-900 sm:text-4xl">Savoir ce que chacun sait réellement faire</h2>
          <span aria-hidden className="mt-4 block h-1 w-16 origin-left animate-underline rounded-full bg-gradient-to-r from-navy-700 to-gold-400" />
          <p className="mt-5 text-lg leading-relaxed text-slate-600">
            Un simple site d&apos;annonces ne suffit pas pour rapprocher les jeunes ingénieurs et techniciens des organisations qui recrutent.
          </p>
          <p className="mt-3 leading-relaxed text-slate-600">
            Il faut savoir ce que chaque candidat sait réellement faire, ce qu&apos;il doit encore renforcer et quels postes correspondent à son profil.
            C&apos;est ce que fait YEN Career Bridge, preuves à l&apos;appui.
          </p>
          {domains.length > 0 && (
            <dl className="mt-8 grid grid-cols-3 gap-4 border-t border-border pt-6">
              {[
                { v: domains.length, l: "domaines d'ingénierie" },
                { v: occupations, l: "métiers décrits" },
                { v: skills, l: "compétences évaluables" },
              ].map((s) => (
                <div key={s.l}>
                  <dt className="sr-only">{s.l}</dt>
                  <dd className="text-3xl font-bold text-navy-900 tabular-nums sm:text-4xl">
                    <CountUp value={s.v} />
                  </dd>
                  <p aria-hidden className="mt-1 text-sm text-muted">{s.l}</p>
                </div>
              ))}
            </dl>
          )}
        </div>
        <div data-reveal="zoom" className="relative">
          <div aria-hidden className="absolute -inset-4 rotate-2 rounded-[2rem] bg-gradient-to-br from-gold-100 via-navy-50 to-electric-100" />
          <div className="relative aspect-[4/3] overflow-clip rounded-3xl shadow-2xl shadow-navy-900/15">
            <div className="media-parallax absolute inset-0">
              <Image
                src={rencontresPhoto}
                alt="Deux jeunes femmes souriantes devant les affiches de l'Africa Engineering Summit et de Youth Engineers Network"
                fill
                placeholder="blur"
                sizes="(min-width: 1024px) 36rem, 100vw"
                className="object-cover object-[50%_20%]"
              />
            </div>
          </div>
          <p className="absolute -bottom-5 left-5 inline-flex animate-float items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-navy-900 shadow-xl shadow-navy-900/15 ring-1 ring-navy-100">
            <BadgeCheck className="size-4 shrink-0 text-gold-600" aria-hidden /> Compétences démontrées, pas seulement déclarées
          </p>
        </div>
      </section>

      {/* Ce que fait la plateforme */}
      <section data-reveal="none" className="bg-canvas">
        <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8 lg:py-24">
          <div data-reveal-children>
            <p className="text-sm font-semibold tracking-wide text-gold-600 uppercase">Ce que fait YEN Career Bridge</p>
            <h2 className="mt-2 text-3xl font-bold tracking-tight text-navy-900 sm:text-4xl">Du dossier du candidat à son insertion</h2>
            <span aria-hidden className="mt-4 block h-1 w-16 origin-left animate-underline rounded-full bg-gradient-to-r from-navy-700 to-gold-400" />
          </div>
          <div data-reveal-children className="mt-10 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map(({ icon: Icon, t, d }) => (
              <div
                key={t}
                data-spotlight
                className="group rounded-2xl border border-border bg-white p-6 transition duration-500 ease-out-expo hover:-translate-y-1.5 hover:border-electric-200 hover:shadow-2xl hover:shadow-electric-500/10"
              >
                <span className="grid size-12 place-items-center rounded-xl bg-gradient-to-br from-navy-50 to-gold-50 text-navy-700 ring-1 ring-navy-100 transition-transform duration-500 ease-spring group-hover:scale-110 group-hover:-rotate-6">
                  <Icon className="size-5" aria-hidden />
                </span>
                <h3 className="mt-4 text-lg font-semibold text-navy-900">{t}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">{d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Principes */}
      <section data-reveal="none" className="relative overflow-hidden bg-navy-950 text-white">
        <div aria-hidden className="pointer-events-none absolute inset-y-0 left-0 w-[200%] animate-gradient-drift bg-[linear-gradient(120deg,rgb(53_101_221/0.2),transparent_40%,rgb(237_180_19/0.12))]" />
        <div className="relative mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
          <div data-reveal-children>
            <p className="text-sm font-semibold tracking-wide text-gold-300 uppercase">Nos principes</p>
            <h2 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">Une plateforme digne de confiance</h2>
            <span aria-hidden className="mt-4 block h-1 w-16 origin-left animate-underline rounded-full bg-gradient-to-r from-gold-300 to-electric-400" />
          </div>
          <div data-reveal-children className="mt-10 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {PRINCIPLES.map(({ icon: Icon, t, d }, i) => (
              <div
                key={t}
                data-spotlight
                className="group rounded-2xl bg-white/[0.05] p-6 ring-1 ring-white/10 transition duration-500 ease-out-expo hover:-translate-y-1 hover:bg-white/[0.08]"
                style={{ "--spot-color": "rgb(237 180 19 / 0.1)" } as CSSProperties}
              >
                <span className="relative grid size-12 place-items-center">
                  <span className="absolute inset-0 animate-ping-slow rounded-full bg-gold-400/25" style={animationDelay(i * 500)} aria-hidden />
                  <span className="relative grid size-12 place-items-center rounded-full bg-gold-400/15 text-gold-300 transition-transform duration-500 ease-spring group-hover:scale-110">
                    <Icon className="size-6" aria-hidden />
                  </span>
                </span>
                <h3 className="mt-4 font-semibold">{t}</h3>
                <p className="mt-1 text-sm leading-relaxed text-navy-200">{d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Appel à l'action */}
      <section data-reveal="none" className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
        <div data-reveal="zoom" className="relative overflow-hidden rounded-3xl bg-navy-800 p-8 text-white sm:p-12">
          <span aria-hidden className="absolute inset-y-0 left-0 w-[300%] animate-gradient-drift bg-[linear-gradient(115deg,var(--color-navy-800),var(--color-navy-600),var(--color-electric-600),var(--color-navy-700))] [--drift:-66.667%]" />
          <span aria-hidden className="absolute -top-16 -right-10 size-56 animate-float-slow rounded-full bg-gold-400/15" />
          <div className="relative flex flex-col items-start justify-between gap-6 md:flex-row md:items-center">
            <div>
              <h2 className="text-2xl font-bold sm:text-3xl">Prêt à faire reconnaître vos compétences&nbsp;?</h2>
              <p className="mt-2 max-w-xl text-white/90">Créez votre profil en quelques minutes, puis passez vos premières évaluations.</p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row">
              <span className="glow-ring">
                <ButtonLink href="/inscription" variant="accent" size="lg" data-magnetic className="group">
                  Créer un compte <ArrowRight className="size-4 transition-transform duration-300 group-hover:translate-x-1" aria-hidden />
                </ButtonLink>
              </span>
              <ButtonLink href="/fonctionnement" size="lg" className="bg-white/10 text-white ring-1 ring-white/20 hover:bg-white/20">
                Fonctionnement
              </ButtonLink>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
