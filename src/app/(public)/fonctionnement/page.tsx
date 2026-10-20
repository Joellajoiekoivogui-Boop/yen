import type { Metadata } from "next";
import { ButtonLink } from "@/components/ui";
import { HOW_IT_WORKS_STEPS as STEPS } from "@/lib/content/how-it-works";

export const metadata: Metadata = { title: "Fonctionnement" };


export default function HowItWorksPage() {
  return (
    <div data-reveal-children className="mx-auto max-w-4xl px-4 py-14 sm:px-6">
      <p className="text-sm font-semibold text-gold-600">Fonctionnement</p>
      <h1 className="mt-2 text-3xl font-bold tracking-tight text-navy-900">Du profil à l&apos;insertion professionnelle</h1>
      <ol data-reveal-children className="mt-10 space-y-6">
        {STEPS.map((s, i) => (
          <li key={s.t} className="group flex gap-4 rounded-xl p-2 transition duration-300 hover:bg-canvas">
            <span className="grid size-9 shrink-0 place-items-center rounded-full bg-gradient-to-br from-navy-800 to-electric-600 text-sm font-bold text-white shadow-md shadow-electric-500/20 transition-transform duration-500 ease-spring group-hover:scale-110 group-hover:rotate-12">{i + 1}</span>
            <div>
              <h2 className="font-semibold text-navy-900">{s.t}</h2>
              <p className="mt-1 text-sm leading-relaxed text-slate-600">{s.d}</p>
            </div>
          </li>
        ))}
      </ol>
      <div className="mt-12 rounded-2xl bg-canvas p-6">
        <h2 className="font-semibold text-navy-900">Le score de compatibilité, expliqué</h2>
        <p className="mt-2 text-sm leading-relaxed text-slate-600">
          Le score (0 à 100) estime l&apos;adéquation entre un profil et un métier ou une offre. Il combine, selon une pondération configurable par YEN, les
          compétences démontrées, les résultats d&apos;évaluation, les projets, la formation et l&apos;expérience. Ce n&apos;est pas une probabilité d&apos;embauche.
          Lorsque des données manquent, elles sont signalées et la confiance du résultat diminue au lieu de compter silencieusement pour zéro.
        </p>
      </div>
      <div className="mt-8"><ButtonLink href="/inscription" variant="secondary">Créer mon profil</ButtonLink></div>
    </div>
  );
}
