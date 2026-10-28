"use client";

import { useMemo, useState } from "react";
import { Search, X } from "lucide-react";
import { DomainOrbit, type DomainCardData } from "@/components/public/domain-orbit";
import { cn } from "@/lib/utils";

type DomainCard = DomainCardData;

type Sort = "catalogue" | "alpha" | "metiers";
const SORTS: { key: Sort; label: string }[] = [
  { key: "catalogue", label: "Ordre du catalogue" },
  { key: "alpha", label: "A → Z" },
  { key: "metiers", label: "Plus de métiers" },
];

const normalize = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Recherche instantanée et tri des domaines d'ingénierie. */
export function DomainExplorer({ domains }: { domains: DomainCard[] }) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<Sort>("catalogue");

  const results = useMemo(() => {
    const q = normalize(query.trim());
    const list = q ? domains.filter((d) => normalize(`${d.name} ${d.short_description}`).includes(q)) : [...domains];
    if (sort === "alpha") list.sort((a, b) => a.name.localeCompare(b.name, "fr"));
    if (sort === "metiers") list.sort((a, b) => b.occupationCount - a.occupationCount || b.skillCount - a.skillCount);
    return list;
  }, [domains, query, sort]);

  return (
    <div className="mt-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-md">
          <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-slate-400" aria-hidden />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Rechercher un domaine (ex. énergie, réseaux, IA…)"
            aria-label="Rechercher un domaine"
            className="field-input h-12 pr-10 pl-10"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              className="absolute top-1/2 right-2 grid size-8 -translate-y-1/2 animate-pop-in place-items-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-navy-900"
              aria-label="Effacer la recherche"
            >
              <X className="size-4" aria-hidden />
            </button>
          )}
        </div>
        <div className="flex gap-1 overflow-x-auto rounded-xl bg-slate-100 p-1" role="group" aria-label="Trier les domaines">
          {SORTS.map((s) => (
            <button
              data-sparkle
              key={s.key}
              type="button"
              onClick={() => setSort(s.key)}
              aria-pressed={sort === s.key}
              className={cn(
                "rounded-lg px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-all duration-300",
                sort === s.key ? "bg-white text-navy-900 shadow-sm" : "text-slate-600 hover:text-navy-900",
              )}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      <p className="mt-4 text-sm text-muted" aria-live="polite">
        {results.length === domains.length ? `${domains.length} domaines` : `${results.length} domaine(s) sur ${domains.length}`}
      </p>

      {results.length === 0 ? (
        <div className="mt-6 flex animate-slide-down flex-col items-center rounded-2xl border border-dashed border-border bg-white px-6 py-12 text-center">
          <span className="animate-float rounded-full bg-navy-50 p-3 text-navy-500">
            <Search className="size-6" aria-hidden />
          </span>
          <p className="mt-3 font-semibold text-navy-900">Aucun domaine ne correspond à « {query} »</p>
          <button type="button" onClick={() => setQuery("")} className="mt-3 text-sm font-medium text-electric-700 hover:underline">
            Afficher tous les domaines
          </button>
        </div>
      ) : (
        // orbite des résultats, trois domaines à la fois ; une nouvelle recherche ou un nouveau tri repart du premier
        <div className="mt-4">
          <DomainOrbit key={`${query}|${sort}`} domains={results} headingLevel={2} label="Résultats du catalogue" />
        </div>
      )}
    </div>
  );
}
