import type { ReactNode } from "react";
import { ChevronDown } from "lucide-react";

/**
 * Questions fréquentes, repliées par défaut : chaque visiteur n'ouvre que celle qui le retient.
 * Lever un doute au moment où il se pose (qui peut s'inscrire, et si j'échoue, qui voit mes données)
 * pèse plus sur la décision de s'inscrire qu'un argument de plus.
 */
export function Faq({ items }: { items: { q: string; a: ReactNode }[] }) {
  return (
    <div className="divide-y divide-border rounded-2xl border border-border bg-white">
      {items.map(({ q, a }) => (
        <details key={q} className="group px-5 sm:px-6">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-4 text-left font-semibold text-navy-900 marker:hidden [&::-webkit-details-marker]:hidden">
            {q}
            <ChevronDown className="size-5 shrink-0 text-navy-700 transition-transform duration-300 group-open:rotate-180" aria-hidden />
          </summary>
          <div className="pb-5 text-sm leading-relaxed text-slate-600">{a}</div>
        </details>
      ))}
    </div>
  );
}
