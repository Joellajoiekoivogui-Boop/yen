import Link from "next/link";
import { ArrowRight, BadgeCheck, Briefcase, ClipboardCheck, FileText, Handshake, LineChart, Lock, Scale, Search, Sparkles, UserCheck } from "lucide-react";
import { ButtonLink } from "@/components/ui";
import { DomainIcon } from "@/components/domain-icon";
import { listDomains } from "@/features/catalog/queries";

export default async function HomePage() {
  const domains = await listDomains().catch(() => []);
  return (
    <>
      {/* Mission */}
      <section className="relative overflow-hidden bg-navy-900 text-white">
        <div className="absolute inset-0 opacity-30 [background:radial-gradient(60rem_30rem_at_80%_-10%,var(--color-electric-500),transparent),radial-gradient(40rem_20rem_at_0%_110%,var(--color-teal-500),transparent)]" aria-hidden />
        <div className="relative mx-auto grid max-w-7xl gap-10 px-4 py-20 sm:px-6 lg:grid-cols-[1.2fr_1fr] lg:px-8 lg:py-28">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-teal-200 ring-1 ring-white/15">
              <Sparkles className="size-3.5" aria-hidden /> Youth Engineers Network · Guinée
            </p>
            <h1 className="mt-5 text-4xl font-bold tracking-tight sm:text-5xl">
              Identifier les talents, renforcer les compétences, <span className="text-teal-300">ouvrir l&apos;accès au stage et à l&apos;emploi.</span>
            </h1>
            <p className="mt-5 max-w-2xl text-lg text-navy-100">
              YEN Career Bridge réunit les profils, les preuves de compétences et les opportunités professionnelles des étudiants et diplômés accompagnés par YEN,
              pour des mises en relation fondées sur ce que chacun sait réellement faire.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <ButtonLink href="/inscription" variant="accent" size="lg">
                Créer mon profil <ArrowRight className="size-4" aria-hidden />
              </ButtonLink>
              <ButtonLink href="/fonctionnement" size="lg" className="bg-white/10 text-white hover:bg-white/20">
                Comment ça marche
              </ButtonLink>
            </div>
          </div>
          <div className="grid content-center gap-3">
            {[
              { icon: FileText, t: "Un profil professionnel complet", d: "CV, formations, projets, certifications et expériences au même endroit." },
              { icon: ClipboardCheck, t: "Des compétences démontrées", d: "Questionnaires, exercices et évaluations : ce qui est prouvé est distingué de ce qui est déclaré." },
              { icon: Briefcase, t: "Des opportunités adaptées", d: "Stages, emplois, alternances et missions rapprochés de votre profil, avec explications." },
            ].map(({ icon: Icon, t, d }) => (
              <div key={t} className="flex gap-4 rounded-xl bg-white/5 p-4 ring-1 ring-white/10">
                <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-teal-400/15 text-teal-300"><Icon className="size-5" aria-hidden /></span>
                <div>
                  <p className="font-semibold">{t}</p>
                  <p className="mt-0.5 text-sm text-navy-200">{d}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pour qui */}
      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        <h2 className="text-2xl font-bold tracking-tight text-navy-900 sm:text-3xl">Une plateforme, trois espaces</h2>
        <p className="mt-2 max-w-2xl text-muted">Chaque utilisateur accède uniquement aux informations qui le concernent.</p>
        <div className="mt-8 grid gap-5 md:grid-cols-3">
          {[
            { icon: UserCheck, t: "Étudiants et diplômés", items: ["Profil et CV sécurisés", "Évaluations par domaine", "Recommandations de métiers et plan de progression", "Candidatures et suivi"] },
            { icon: Search, t: "Équipe YEN", items: ["Répertoire des talents filtrable", "Preuves de compétences et analyses explicables", "Présélection et suivi des placements", "Rapports d'insertion"] },
            { icon: Handshake, t: "Partenaires", items: ["Publication d'offres validées par YEN", "Accès limité aux profils partagés", "Suivi des recrutements", "Retours sur les compétences"] },
          ].map(({ icon: Icon, t, items }) => (
            <div key={t} className="rounded-2xl border border-border p-6">
              <span className="grid size-11 place-items-center rounded-xl bg-electric-50 text-electric-600"><Icon className="size-5" aria-hidden /></span>
              <h3 className="mt-4 text-lg font-semibold text-navy-900">{t}</h3>
              <ul className="mt-3 space-y-2 text-sm text-slate-600">
                {items.map((i) => (
                  <li key={i} className="flex gap-2"><BadgeCheck className="mt-0.5 size-4 shrink-0 text-teal-500" aria-hidden />{i}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      {/* Engagements */}
      <section className="bg-canvas">
        <div className="mx-auto grid max-w-7xl gap-6 px-4 py-16 sm:px-6 md:grid-cols-3 lg:px-8">
          {[
            { icon: Lock, t: "Données protégées", d: "Documents privés, accès contrôlés par rôle, consentement explicite avant tout partage avec un partenaire." },
            { icon: Scale, t: "Analyses explicables", d: "Chaque recommandation cite ses sources. Aucune caractéristique sensible n'est utilisée pour classer les candidats." },
            { icon: LineChart, t: "Décision humaine", d: "Les scores de compatibilité aident l'équipe YEN ; la décision finale reste toujours humaine." },
          ].map(({ icon: Icon, t, d }) => (
            <div key={t} className="rounded-2xl bg-white p-6 shadow-[var(--shadow-card)]">
              <Icon className="size-6 text-teal-500" aria-hidden />
              <h3 className="mt-3 font-semibold text-navy-900">{t}</h3>
              <p className="mt-1 text-sm text-slate-600">{d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Domaines */}
      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-navy-900 sm:text-3xl">{domains.length} domaines d&apos;ingénierie</h2>
            <p className="mt-2 max-w-2xl text-muted">Chaque domaine décrit ses métiers, ses compétences avec des critères observables et ses évaluations.</p>
          </div>
          <ButtonLink href="/domaines" variant="outline">Voir tous les domaines</ButtonLink>
        </div>
        <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {domains.map((d) => (
            <Link key={d.slug} href={`/domaines/${d.slug}`} className="group flex items-start gap-3 rounded-xl border border-border p-4 transition-colors hover:border-electric-300 hover:bg-electric-50/40">
              <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-navy-50 text-navy-700 group-hover:bg-electric-100 group-hover:text-electric-700">
                <DomainIcon name={d.icon} className="size-5" />
              </span>
              <span>
                <span className="block text-sm font-semibold text-navy-900">{d.name}</span>
                <span className="mt-0.5 block text-xs text-muted">{d.short_description}</span>
              </span>
            </Link>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 pb-20 sm:px-6 lg:px-8">
        <div className="flex flex-col items-start justify-between gap-6 rounded-2xl bg-gradient-to-r from-electric-600 to-teal-500 p-8 text-white md:flex-row md:items-center">
          <div>
            <h2 className="text-2xl font-bold">Vous êtes accompagné(e) par YEN ?</h2>
            <p className="mt-1 text-white/90">Créez votre profil, faites reconnaître vos compétences et suivez vos candidatures.</p>
          </div>
          <ButtonLink href="/inscription" size="lg" className="bg-white text-navy-900 hover:bg-navy-50">Commencer</ButtonLink>
        </div>
      </section>
    </>
  );
}
