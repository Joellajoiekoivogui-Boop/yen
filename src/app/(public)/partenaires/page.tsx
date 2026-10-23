import type { Metadata } from "next";
import { ArrowRight, BadgeCheck, Building2, CalendarCheck, FilePlus2, Handshake, Lock, Send, ShieldCheck, UserCheck } from "lucide-react";
import { ButtonLink, EmptyState } from "@/components/ui";
import { revealDelay } from "@/components/motion/delay";
import { EdgeBeam, NightSky } from "@/components/motion/sky";
import { PageHero } from "@/components/public/page-hero";
import { SectionTitle } from "@/components/public/section-title";
import { listPublicPartners } from "@/features/catalog/queries";
import tropheesPhoto from "@/assets/photos/trophees.jpg";

export const metadata: Metadata = { title: "Partenaires" };

const BENEFITS = [
  { icon: BadgeCheck, t: "Des compétences prouvées", d: "Les profils distinguent ce qui est déclaré de ce qui est démontré : évaluations, projets vérifiés, avis d'évaluateurs YEN." },
  { icon: UserCheck, t: "Une présélection par YEN", d: "L'équipe YEN vous propose des candidats adaptés à vos offres, avec un score de compatibilité expliqué." },
  { icon: Lock, t: "Un cadre de confiance", d: "Les profils sont partagés avec le consentement des candidats ; le contact passe par YEN ou par l'entretien." },
];

const STEPS = [
  { icon: Handshake, t: "Demander un espace", d: "Inscription de l'organisation en quelques minutes." },
  { icon: ShieldCheck, t: "Validation par YEN", d: "L'équipe vérifie l'organisation et ouvre l'espace." },
  { icon: FilePlus2, t: "Publier des offres", d: "Stages, emplois, alternances, missions, validés par YEN." },
  { icon: Send, t: "Recevoir des candidats", d: "Candidatures et profils présélectionnés par YEN." },
  { icon: CalendarCheck, t: "Entretiens et décision", d: "Suivi du recrutement jusqu'au placement." },
];

/** N'affiche QUE les organisations dont la publication a été autorisée (is_public) et actives. */
export default async function PartnersPage() {
  const orgs = await listPublicPartners();
  return (
    <>
      <PageHero
        eyebrow="Partenaires"
        title="Organisations partenaires"
        description={
          <p>
            Entreprises, ONG, bureaux d&apos;études et institutions qui collaborent avec YEN pour recruter de jeunes ingénieurs et techniciens dont les
            compétences sont démontrées.
          </p>
        }
        photo={tropheesPhoto}
        photoAlt="Jeune homme déballant des trophées, dont un trophée en forme de casque de chantier"
        caption="Remise des trophées lors de l'Africa Engineering Summit"
      >
        <ButtonLink href="/inscription?type=partenaire" variant="accent" size="lg" data-magnetic data-sparkle className="btn-gleam group w-full shadow-lg shadow-gold-500/30 sm:w-auto">
          Demander un espace partenaire <ArrowRight className="size-4 transition-transform duration-300 group-hover:translate-x-1" aria-hidden />
        </ButtonLink>
      </PageHero>

      {/* Pourquoi recruter avec YEN */}
      <section data-reveal="none" className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8 lg:py-24">
        <SectionTitle eyebrow="Pourquoi recruter avec YEN" title="Des candidats évalués, présentés avec leurs preuves" />
        <div data-reveal-children className="mt-10 grid grid-cols-1 gap-5 md:grid-cols-3">
          {BENEFITS.map(({ icon: Icon, t, d }) => (
            <div
              key={t}
              data-spotlight
              data-tilt
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
      </section>

      {/* Les étapes pour une organisation (overflow-clip : le trait animé suit le défilement de la page) */}
      <section data-reveal="none" className="relative overflow-clip bg-navy-950 text-white">
        <div aria-hidden className="pointer-events-none absolute inset-y-0 left-0 w-[200%] animate-gradient-drift bg-[linear-gradient(120deg,rgb(53_101_221/0.2),transparent_40%,rgb(237_180_19/0.12))]" />
        <NightSky stars={3} twinkles={4} />
        <div className="relative mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
          <SectionTitle eyebrow="Comment ça marche" title="De la demande au recrutement" inverted />
          <ol className="relative mt-12 grid grid-cols-1 gap-8 md:grid-cols-5 md:gap-4">
            {/* trait reliant les étapes, tracé à l'arrivée à l'écran (ordinateur) */}
            <span aria-hidden className="absolute top-6 right-[10%] left-[10%] hidden h-0.5 bg-white/10 md:block" />
            <span aria-hidden className="bar-grow absolute top-6 right-[10%] left-[10%] hidden h-0.5 bg-gradient-to-r from-gold-300 via-electric-400 to-gold-300 md:block" />
            {/* comète qui file d'une étape à l'autre */}
            <span aria-hidden className="comet-track pointer-events-none absolute top-6 right-[10%] left-[10%] hidden h-0.5 md:block">
              <span className="comet-x" />
            </span>
            {STEPS.map(({ icon: Icon, t, d }, i) => (
              <li key={t} data-reveal="up" className="group relative flex gap-4 md:flex-col md:items-center md:text-center" style={revealDelay(i * 90)}>
                <span className="relative z-10 grid size-12 shrink-0 place-items-center rounded-full bg-navy-900 text-gold-300 ring-2 ring-gold-300/40 transition-transform duration-500 ease-spring group-hover:scale-110">
                  <Icon className="size-5" aria-hidden />
                  <span className="absolute -top-1 -right-1 grid size-5 place-items-center rounded-full bg-gold-400 text-2xs font-bold text-navy-950">{i + 1}</span>
                </span>
                <div>
                  <h3 className="font-semibold">{t}</h3>
                  <p className="mt-1 text-sm text-navy-200">{d}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Partenaires publiés */}
      <section data-reveal="none" className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
        <SectionTitle eyebrow="Ils collaborent avec YEN" title="Nos partenaires" description="Seules les organisations ayant autorisé leur publication sont affichées." />
        <div className="mt-8">
          {orgs.length === 0 ? (
            <div data-reveal="up">
              <EmptyState icon={Building2} title="Aucun partenaire publié pour le moment" description="Les organisations partenaires apparaîtront ici après leur autorisation de publication." />
            </div>
          ) : (
            <div data-reveal-children className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {orgs.map((o) => (
                <div key={o.id} data-spotlight className="rounded-2xl border border-border bg-white p-5 transition duration-500 ease-out-expo hover:-translate-y-1 hover:shadow-xl hover:shadow-navy-900/5">
                  <h3 className="font-semibold text-navy-900">{o.name}</h3>
                  <p className="text-xs text-muted">{[o.sector, o.city].filter(Boolean).join(" · ")}</p>
                  <p className="mt-2 line-clamp-4 text-sm text-slate-600">{o.description}</p>
                </div>
              ))}
            </div>
          )}
        </div>
        <div data-reveal="zoom" className="relative mt-12 flex flex-col gap-5 rounded-2xl border border-gold-200 bg-gold-50/60 p-6 sm:flex-row sm:items-center sm:justify-between">
          <EdgeBeam />
          <div className="flex gap-4">
            <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-gold-400/20 text-gold-700">
              <Handshake className="size-5" aria-hidden />
            </span>
            <div>
              <h2 className="font-semibold text-navy-900">Votre organisation souhaite recruter des talents accompagnés par YEN ?</h2>
              <p className="mt-1 text-sm text-slate-600">Publiez vos offres (validées par YEN) et recevez des profils présélectionnés, partagés avec le consentement des candidats.</p>
            </div>
          </div>
          <ButtonLink href="/inscription?type=partenaire" data-sparkle className="group w-full shrink-0 sm:w-auto">
            Demander un espace partenaire <ArrowRight className="size-4 transition-transform duration-300 group-hover:translate-x-1" aria-hidden />
          </ButtonLink>
        </div>
      </section>
    </>
  );
}
