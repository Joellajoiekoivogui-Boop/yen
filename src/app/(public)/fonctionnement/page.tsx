import type { Metadata } from "next";
import { ArrowRight, Lock, ShieldCheck, UserCheck } from "lucide-react";
import { ButtonLink } from "@/components/ui";
import { PageHero } from "@/components/public/page-hero";
import { DEFAULT_WEIGHTS, WEIGHT_LABELS, type Weights } from "@/features/matching/engine";
import { HOW_IT_WORKS_STEPS as STEPS } from "@/lib/content/how-it-works";
import etudiantsPhoto from "@/assets/photos/etudiants.jpg";

export const metadata: Metadata = { title: "Fonctionnement" };

const HUMAN = [
  { icon: UserCheck, t: "La décision reste humaine", d: "Le score aide l'équipe YEN et les recruteurs ; il ne décide jamais à leur place." },
  { icon: ShieldCheck, t: "Le niveau expert se prouve", d: "Il n'est jamais attribué par un simple questionnaire : il faut une évaluation humaine ou des preuves." },
  { icon: Lock, t: "Rien n'est partagé sans accord", d: "Un profil n'est transmis à un partenaire qu'avec le consentement du candidat." },
];

export default function HowItWorksPage() {
  const weights = Object.entries(DEFAULT_WEIGHTS) as [keyof Weights, number][];
  return (
    <>
      <PageHero
        eyebrow="Fonctionnement"
        title="Du profil à l'insertion professionnelle"
        description={<p>Six étapes, de la création du compte au suivi après placement. Chacune s&apos;appuie sur des preuves, et les décisions restent humaines.</p>}
        photo={etudiantsPhoto}
        photoAlt="Étudiante concentrée sur son ordinateur portable dans un amphithéâtre, entourée d'autres participants"
        caption="Chaque compétence démontrée repose sur une preuve"
      >
        <ButtonLink href="/inscription" variant="accent" size="lg" data-magnetic className="group w-full shadow-lg shadow-gold-500/30 sm:w-auto">
          Créer mon profil <ArrowRight className="size-4 transition-transform duration-300 group-hover:translate-x-1" aria-hidden />
        </ButtonLink>
      </PageHero>

      {/* Parcours : la ligne se remplit et chaque étape s'allume au fil du défilement */}
      <section data-reveal="none" className="mx-auto max-w-4xl px-4 py-20 sm:px-6 lg:py-24">
        <div data-reveal-children>
          <p className="text-sm font-semibold tracking-wide text-gold-600 uppercase">Le parcours du candidat</p>
          <h2 className="mt-2 text-3xl font-bold tracking-tight text-navy-900 sm:text-4xl">Six étapes, dans l&apos;ordre</h2>
          <span aria-hidden className="mt-4 block h-1 w-16 origin-left animate-underline rounded-full bg-gradient-to-r from-navy-700 to-gold-400" />
        </div>
        <ol className="relative mt-12 space-y-6">
          <span aria-hidden className="absolute top-2 bottom-2 left-[1.375rem] w-0.5 rounded-full bg-navy-100 sm:left-[1.625rem]" />
          <span aria-hidden className="timeline-fill absolute top-2 bottom-2 left-[1.375rem] w-0.5 rounded-full bg-gradient-to-b from-gold-400 via-electric-500 to-navy-700 sm:left-[1.625rem]" />
          {STEPS.map(({ t, d, icon: Icon }, i) => (
            <li key={t} data-reveal="up" className="group relative flex gap-5 sm:gap-6">
              {/* numéro bleu au repos ; la pastille allumée (même numéro, en blanc) apparaît au défilement */}
              <span className="relative z-10 grid size-11 shrink-0 place-items-center rounded-full bg-white text-sm font-bold text-navy-800 ring-2 ring-navy-100 sm:size-[3.25rem]">
                {i + 1}
                <span aria-hidden className="step-light absolute inset-0 grid place-items-center rounded-full bg-gradient-to-br from-navy-800 to-electric-600 text-white shadow-lg shadow-electric-500/30">
                  {i + 1}
                </span>
              </span>
              <div className="min-w-0 flex-1 rounded-2xl border border-border bg-white p-5 transition duration-500 ease-out-expo group-hover:-translate-y-1 group-hover:border-electric-200 group-hover:shadow-xl group-hover:shadow-electric-500/10 sm:p-6">
                <div className="flex items-center gap-3">
                  <span className="grid size-9 place-items-center rounded-lg bg-gold-50 text-gold-700 ring-1 ring-gold-100 transition-transform duration-500 ease-spring group-hover:scale-110 group-hover:-rotate-6">
                    <Icon className="size-4" aria-hidden />
                  </span>
                  <h3 className="text-lg font-semibold text-navy-900">{t}</h3>
                </div>
                <p className="mt-2 leading-relaxed text-slate-600">{d}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      {/* Score de compatibilité */}
      <section data-reveal="none" className="bg-canvas">
        <div className="mx-auto grid max-w-7xl gap-12 px-4 py-20 sm:px-6 lg:grid-cols-2 lg:px-8 lg:py-24">
          <div data-reveal-children className="min-w-0">
            <p className="text-sm font-semibold tracking-wide text-gold-600 uppercase">Le score de compatibilité</p>
            <h2 className="mt-2 text-3xl font-bold tracking-tight text-navy-900 sm:text-4xl">Un score expliqué, pas une prédiction</h2>
            <span aria-hidden className="mt-4 block h-1 w-16 origin-left animate-underline rounded-full bg-gradient-to-r from-navy-700 to-gold-400" />
            <p className="mt-5 leading-relaxed text-slate-600">
              Le score (0 à 100) estime l&apos;adéquation entre un profil et un métier ou une offre. Il combine, selon une pondération configurable par YEN, les
              compétences démontrées, les résultats d&apos;évaluation, les projets, la formation et l&apos;expérience. Ce n&apos;est pas une probabilité d&apos;embauche.
            </p>
            <p className="mt-3 leading-relaxed text-slate-600">
              Lorsque des données manquent, elles sont signalées et la confiance du résultat diminue au lieu de compter silencieusement pour zéro.
            </p>
          </div>
          <div data-reveal="up" className="min-w-0 rounded-2xl border border-border bg-white p-6 shadow-sm sm:p-8">
            <p className="text-sm font-semibold text-navy-900">Pondération par défaut</p>
            <p className="text-xs text-muted">Ajustable par l&apos;équipe YEN</p>
            <ul className="mt-6 space-y-5">
              {weights.map(([key, value]) => (
                <li key={key}>
                  <div className="flex items-baseline justify-between gap-3 text-sm">
                    <span className="font-medium text-slate-700">{WEIGHT_LABELS[key]}</span>
                    <span className="font-semibold text-navy-900 tabular-nums">{value}&nbsp;%</span>
                  </div>
                  <div className="mt-2 h-2.5 overflow-clip rounded-full bg-navy-50">
                    <span className="bar-grow block h-full rounded-full bg-gradient-to-r from-navy-700 via-electric-500 to-gold-400" style={{ width: `${value * 2}%` }} />
                  </div>
                </li>
              ))}
            </ul>
            <p className="mt-6 text-xs text-muted">Barres à l&apos;échelle : la plus longue représente 50 %.</p>
          </div>
        </div>
      </section>

      {/* Ce qui reste humain */}
      <section data-reveal="none" className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
        <div data-reveal-children className="grid grid-cols-1 gap-5 md:grid-cols-3">
          {HUMAN.map(({ icon: Icon, t, d }) => (
            <div key={t} data-spotlight className="group rounded-2xl border border-border bg-white p-6 transition duration-500 ease-out-expo hover:-translate-y-1 hover:shadow-xl hover:shadow-navy-900/5">
              <span className="grid size-11 place-items-center rounded-xl bg-navy-900 text-gold-300 transition-transform duration-500 ease-spring group-hover:scale-110 group-hover:rotate-6">
                <Icon className="size-5" aria-hidden />
              </span>
              <h3 className="mt-4 font-semibold text-navy-900">{t}</h3>
              <p className="mt-1 text-sm leading-relaxed text-slate-600">{d}</p>
            </div>
          ))}
        </div>
        <div data-reveal="up" className="mt-12 flex flex-col items-center gap-4 text-center">
          <p className="text-lg font-semibold text-navy-900">Prêt à commencer&nbsp;?</p>
          <span className="glow-ring">
            <ButtonLink href="/inscription" variant="secondary" size="lg" data-magnetic className="group">
              Créer mon profil <ArrowRight className="size-4 transition-transform duration-300 group-hover:translate-x-1" aria-hidden />
            </ButtonLink>
          </span>
        </div>
      </section>
    </>
  );
}
