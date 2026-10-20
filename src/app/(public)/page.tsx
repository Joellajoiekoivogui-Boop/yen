import Link from "next/link";
import type { CSSProperties } from "react";
import { ArrowRight, ArrowUpRight, BadgeCheck, Briefcase, ClipboardCheck, FileText, Handshake, LineChart, Lock, Scale, Search, UserCheck } from "lucide-react";
import { ButtonLink } from "@/components/ui";
import { DomainIcon } from "@/components/domain-icon";
import { CountUp } from "@/components/motion/count-up";
import { animationDelay, revealDelay } from "@/components/motion/delay";
import { listDomains } from "@/features/catalog/queries";

const HERO_CARDS = [
  { icon: FileText, t: "Un profil professionnel complet", d: "CV, formations, projets, certifications et expériences au même endroit." },
  { icon: ClipboardCheck, t: "Des compétences démontrées", d: "Questionnaires, exercices et évaluations : ce qui est prouvé est distingué de ce qui est déclaré." },
  { icon: Briefcase, t: "Des opportunités adaptées", d: "Stages, emplois, alternances et missions rapprochés de votre profil, avec explications." },
];

const SPACES = [
  { icon: UserCheck, t: "Étudiants et diplômés", items: ["Profil et CV sécurisés", "Évaluations par domaine", "Recommandations de métiers et plan de progression", "Candidatures et suivi"] },
  { icon: Search, t: "Équipe YEN", items: ["Répertoire des talents filtrable", "Preuves de compétences et analyses explicables", "Présélection et suivi des placements", "Rapports d'insertion"] },
  { icon: Handshake, t: "Partenaires", items: ["Publication d'offres validées par YEN", "Accès limité aux profils partagés", "Suivi des recrutements", "Retours sur les compétences"] },
];

const COMMITMENTS = [
  { icon: Lock, t: "Données protégées", d: "Documents privés, accès contrôlés par rôle, consentement explicite avant tout partage avec un partenaire." },
  { icon: Scale, t: "Analyses explicables", d: "Chaque recommandation cite ses sources. Aucune caractéristique sensible n'est utilisée pour classer les candidats." },
  { icon: LineChart, t: "Décision humaine", d: "Les scores de compatibilité aident l'équipe YEN ; la décision finale reste toujours humaine." },
];

/** Mots qui défilent dans le titre (le dernier répète le premier pour une boucle sans saut). */
const ROTATING_WORDS = ["au stage", "à l’emploi", "à l’alternance", "aux missions", "au stage"];

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
  const domains = await listDomains().catch(() => []);
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
          {PARTICLES.map((p, i) => (
            <span
              key={i}
              className="hero-particle"
              style={{ left: `${p.left}%`, top: `${p.top}%`, width: p.size, height: p.size, "--particle-delay": `${p.delay}s`, "--particle-duration": `${p.duration}s` } as CSSProperties}
            />
          ))}
        </div>

        <div className="relative mx-auto grid max-w-7xl gap-12 px-4 pt-20 pb-28 sm:px-6 lg:grid-cols-[1.15fr_1fr] lg:px-8 lg:pt-28 lg:pb-36">
          <div data-reveal-children>
            <p className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-gold-200 ring-1 ring-white/15 backdrop-blur">
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
                  <span className="word-rotator-track">
                    {ROTATING_WORDS.map((w, i) => (
                      <span key={i} className="text-shine">{w}</span>
                    ))}
                  </span>
                </span>
              </span>
            </h1>
            <p className="mt-6 max-w-2xl text-lg text-navy-100">
              YEN Career Bridge réunit les profils, les preuves de compétences et les opportunités professionnelles des étudiants et diplômés accompagnés par YEN,
              pour des mises en relation fondées sur ce que chacun sait réellement faire.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <ButtonLink href="/inscription" variant="accent" size="lg" data-magnetic className="group shadow-lg shadow-gold-500/30">
                Créer mon profil <ArrowRight className="size-4 transition-transform duration-300 group-hover:translate-x-1" aria-hidden />
              </ButtonLink>
              <ButtonLink href="/fonctionnement" size="lg" data-magnetic className="bg-white/10 text-white ring-1 ring-white/20 backdrop-blur hover:bg-white/20">
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
                  <div key={s.label}>
                    <dt className="sr-only">{s.label}</dt>
                    <dd>
                      <CountUp value={s.value} className="block font-heading text-3xl font-bold text-gold-300 tabular-nums sm:text-4xl" />
                      <span className="mt-1 block text-xs text-navy-200 sm:text-sm">{s.label}</span>
                    </dd>
                  </div>
                ))}
              </dl>
            )}
          </div>

          <div className="relative grid content-center gap-4">
            <div aria-hidden className="pointer-events-none absolute top-1/2 left-1/2 hidden size-[34rem] -translate-x-1/2 -translate-y-1/2 lg:block">
              <div className="absolute inset-0 animate-spin-slow rounded-full border border-dashed border-white/10">
                <span className="absolute -top-1.5 left-1/2 size-3 -translate-x-1/2 rounded-full bg-gold-300 shadow-[0_0_18px_4px_rgb(237_180_19/0.6)]" />
              </div>
              <div className="absolute inset-16 animate-spin-reverse rounded-full border border-white/10">
                <span className="absolute -bottom-1 left-1/2 size-2 -translate-x-1/2 rounded-full bg-electric-300 shadow-[0_0_14px_3px_rgb(143_174_247/0.6)]" />
              </div>
            </div>
            {HERO_CARDS.map(({ icon: Icon, t, d }, i) => (
              <div key={t} className="relative animate-hero-card" style={animationDelay(450 + i * 160)}>
                <div className="animate-float" style={animationDelay(-i * 1900)}>
                  <div data-tilt className="group flex gap-4 rounded-2xl bg-white/[0.06] p-5 ring-1 ring-white/15 backdrop-blur-md transition-colors duration-300 hover:bg-white/[0.1] hover:ring-gold-300/40">
                    <span className="relative grid size-11 shrink-0 place-items-center rounded-xl bg-gold-400/15 text-gold-300">
                      <span className="absolute inset-0 animate-ping-slow rounded-xl ring-1 ring-gold-300/50" style={animationDelay(i * 800)} aria-hidden />
                      <Icon className="size-5 transition-transform duration-500 ease-spring group-hover:scale-125 group-hover:rotate-6" aria-hidden />
                    </span>
                    <div>
                      <p className="font-semibold">{t}</p>
                      <p className="mt-0.5 text-sm text-navy-200">{d}</p>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div aria-hidden className="absolute bottom-6 left-1/2 hidden -translate-x-1/2 md:block">
          <div className="flex h-9 w-6 justify-center rounded-full border-2 border-white/30 pt-1.5">
            <span className="scroll-cue-dot size-1.5 rounded-full bg-white/80" />
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
        <div data-reveal-children className="mt-10 grid gap-5 md:grid-cols-3">
          {SPACES.map(({ icon: Icon, t, items }) => (
            <div
              key={t}
              data-spotlight
              className="group rounded-2xl border border-border bg-white p-6 transition duration-500 ease-out-expo hover:-translate-y-1.5 hover:border-electric-200 hover:shadow-2xl hover:shadow-electric-500/10"
            >
              <span className="grid size-12 place-items-center rounded-xl bg-gradient-to-br from-navy-50 to-gold-50 text-navy-700 ring-1 ring-navy-100 transition-transform duration-500 ease-spring group-hover:scale-110 group-hover:-rotate-6">
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
            </div>
          ))}
        </div>
      </section>

      {/* Engagements */}
      <section data-reveal="none" className="relative overflow-hidden bg-navy-950 text-white">
        <div aria-hidden className="pointer-events-none absolute inset-0 animate-gradient-pan bg-[linear-gradient(120deg,rgb(53_101_221/0.2),transparent_40%,rgb(237_180_19/0.12))] bg-[length:200%_200%]" />
        <div className="relative mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
          <SectionTitle eyebrow="Nos engagements" title="Une plateforme digne de confiance" inverted />
          <div data-reveal-children className="mt-10 grid gap-6 md:grid-cols-3">
            {COMMITMENTS.map(({ icon: Icon, t, d }, i) => (
              <div
                key={t}
                data-spotlight
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

      {/* Domaines */}
      <section data-reveal="none" className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8 lg:py-24">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <SectionTitle
            eyebrow="Catalogue"
            title={`${domains.length} domaines d'ingénierie`}
            description="Chaque domaine décrit ses métiers, ses compétences avec des critères observables et ses évaluations."
          />
          <div data-reveal="up">
            <ButtonLink href="/domaines" variant="outline" className="group">
              Voir tous les domaines <ArrowRight className="size-4 transition-transform duration-300 group-hover:translate-x-1" aria-hidden />
            </ButtonLink>
          </div>
        </div>
        <div className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {domains.map((d, i) => (
            <Link
              key={d.slug}
              href={`/domaines/${d.slug}`}
              data-reveal="zoom"
              data-spotlight
              style={revealDelay((i % 3) * 80 + Math.floor(i / 3) * 50)}
              className="group flex items-start gap-3 overflow-hidden rounded-xl border border-border bg-white p-4 transition duration-300 ease-out-expo hover:-translate-y-1 hover:border-electric-300 hover:shadow-lg hover:shadow-electric-500/10"
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
      </section>

      {/* Appel à l'action */}
      <section data-reveal="none" className="mx-auto max-w-7xl px-4 pb-24 sm:px-6 lg:px-8">
        <div data-reveal="zoom">
          <div className="relative animate-gradient-pan overflow-hidden rounded-3xl bg-[linear-gradient(115deg,var(--color-navy-800),var(--color-navy-600),var(--color-electric-600),var(--color-navy-700))] bg-[length:300%_300%] p-8 text-white sm:p-12">
            <span aria-hidden className="absolute -top-16 -right-10 size-56 animate-float-slow rounded-full bg-gold-400/15" />
            <span aria-hidden className="absolute -bottom-20 left-1/3 size-44 animate-float rounded-full bg-white/10 [animation-delay:-3s]" />
            <span aria-hidden className="absolute top-8 left-8 size-3 animate-ping-slow rounded-full bg-gold-300" />
            <div className="relative flex flex-col items-start justify-between gap-6 md:flex-row md:items-center">
              <div>
                <h2 className="text-2xl font-bold sm:text-3xl">Vous êtes accompagné(e) par YEN ?</h2>
                <p className="mt-2 max-w-xl text-white/90">Créez votre profil, faites reconnaître vos compétences et suivez vos candidatures.</p>
              </div>
              <ButtonLink href="/inscription" variant="accent" size="lg" data-magnetic className="group animate-glow-pulse">
                Commencer <ArrowRight className="size-4 transition-transform duration-300 group-hover:translate-x-1" aria-hidden />
              </ButtonLink>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
