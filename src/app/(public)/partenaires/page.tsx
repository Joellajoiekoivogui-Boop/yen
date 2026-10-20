import type { Metadata } from "next";
import { Building2 } from "lucide-react";
import { EmptyState } from "@/components/ui";
import { isSupabaseConfigured } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Partenaires" };

/** N'affiche QUE les organisations dont la publication a été autorisée (is_public) et actives. */
export default async function PartnersPage() {
  let orgs: { id: string; name: string; sector: string; city: string | null; description: string; is_demo: boolean }[] = [];
  if (isSupabaseConfigured()) {
    const supabase = await createClient();
    const { data } = await supabase.from("organizations").select("id, name, sector, city, description, is_demo").eq("is_public", true).eq("status", "actif").eq("is_demo", false).order("name");
    orgs = data ?? [];
  }
  return (
    <div data-reveal-children className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
      <p className="text-sm font-semibold text-teal-600">Partenaires</p>
      <h1 className="mt-2 text-3xl font-bold tracking-tight text-navy-900">Organisations partenaires</h1>
      <p className="mt-2 max-w-2xl text-muted">
        Entreprises, ONG, bureaux d&apos;études et institutions qui collaborent avec YEN. Seules les organisations ayant autorisé leur publication sont affichées.
      </p>
      <div className="mt-8">
        {orgs.length === 0 ? (
          <EmptyState icon={Building2} title="Aucun partenaire publié pour le moment" description="Les organisations partenaires apparaîtront ici après leur autorisation de publication." />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
      <p className="mt-10 text-sm text-slate-600">
        Votre organisation souhaite recruter des talents accompagnés par YEN ? <a className="font-medium text-electric-700 underline" href="/inscription?type=partenaire">Demandez un espace partenaire</a>.
      </p>
    </div>
  );
}
