import type { Metadata } from "next";
import { ArrowRight, Building2, Handshake } from "lucide-react";
import { ButtonLink, EmptyState } from "@/components/ui";
import { listPublicPartners } from "@/features/catalog/queries";

export const metadata: Metadata = { title: "Partenaires" };

/** N'affiche QUE les organisations dont la publication a été autorisée (is_public) et actives. */
export default async function PartnersPage() {
  const orgs = await listPublicPartners();
  return (
    <div data-reveal-children className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
      <p className="text-sm font-semibold text-gold-600">Partenaires</p>
      <h1 className="mt-2 text-3xl font-bold tracking-tight text-navy-900">Organisations partenaires</h1>
      <p className="mt-2 max-w-2xl text-muted">
        Entreprises, ONG, bureaux d&apos;études et institutions qui collaborent avec YEN. Seules les organisations ayant autorisé leur publication sont affichées.
      </p>
      <div className="mt-8">
        {orgs.length === 0 ? (
          <EmptyState icon={Building2} title="Aucun partenaire publié pour le moment" description="Les organisations partenaires apparaîtront ici après leur autorisation de publication." />
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {orgs.map((o) => (
              <div key={o.id} className="rounded-2xl border border-border p-5">
                <h2 className="font-semibold text-navy-900">{o.name}</h2>
                <p className="text-xs text-muted">{[o.sector, o.city].filter(Boolean).join(" · ")}</p>
                <p className="mt-2 line-clamp-4 text-sm text-slate-600">{o.description}</p>
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="mt-10 flex flex-col gap-5 rounded-2xl border border-gold-200 bg-gold-50/60 p-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex gap-4">
          <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-gold-400/20 text-gold-700">
            <Handshake className="size-5" aria-hidden />
          </span>
          <div>
            <h2 className="font-semibold text-navy-900">Votre organisation souhaite recruter des talents accompagnés par YEN ?</h2>
            <p className="mt-1 text-sm text-slate-600">Publiez vos offres (validées par YEN) et recevez des profils présélectionnés, partagés avec le consentement des candidats.</p>
          </div>
        </div>
        <ButtonLink href="/inscription?type=partenaire" className="group w-full shrink-0 sm:w-auto">
          Demander un espace partenaire <ArrowRight className="size-4 transition-transform duration-300 group-hover:translate-x-1" aria-hidden />
        </ButtonLink>
      </div>
    </div>
  );
}
