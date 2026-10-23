"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowUpRight, Search, X } from "lucide-react";
import { DomainIcon } from "@/components/domain-icon";
import { revealDelay } from "@/components/motion/delay";
import { cn } from "@/lib/utils";

interface DomainCard {
  slug: string;
  name: string;
  short_description: string;
  icon: string;
  occupationCount: number;
  skillCount: number;
}

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
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {results.map((d, i) => (
            <Link
              key={`${d.slug}-${sort}`}
              href={`/domaines/${d.slug}`}
              data-reveal="zoom"
              data-spotlight
              data-tilt
              style={revealDelay(Math.min(i, 8) * 45)}
              className="group relative rounded-2xl border border-border bg-white p-5 transition duration-300 ease-out-expo hover:-translate-y-1 hover:border-navy-200 hover:shadow-xl hover:shadow-navy-900/10"
            >
              <div className="flex items-start justify-between gap-3">
                <span className="grid size-11 place-items-center rounded-xl bg-navy-50 text-navy-700 transition-colors duration-300 group-hover:bg-gold-400 group-hover:text-navy-950">
                  <span className="group-hover:animate-bounce-soft">
                    <DomainIcon name={d.icon} className="size-5" />
                  </span>
                </span>
                <ArrowUpRight className="size-5 -translate-x-1 text-navy-400 opacity-0 transition duration-300 group-hover:translate-x-0 group-hover:opacity-100" aria-hidden />
              </div>
              <h2 className="mt-4 font-semibold text-navy-900">{d.name}</h2>
              <p className="mt-1 text-sm text-slate-600">{d.short_description}</p>
              <div className="mt-4 flex gap-2 text-xs">
                <span className="rounded-full bg-navy-50 px-2.5 py-1 font-medium text-navy-700">{d.occupationCount} métiers</span>
                <span className="rounded-full bg-gold-50 px-2.5 py-1 font-medium text-gold-700">{d.skillCount} compétences</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
