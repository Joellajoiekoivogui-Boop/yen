"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { CornerDownLeft, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import type { NavSection } from "./app-shell";

/** Ouvre la palette de commandes depuis n'importe quel bouton. */
export function openCommandPalette() {
  window.dispatchEvent(new Event("yen:command-palette"));
}

const normalize = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/**
 * Recherche rapide dans la navigation (Ctrl+K ou ⌘K) : on tape quelques lettres,
 * on choisit avec les flèches et on ouvre avec Entrée.
 */
export function CommandPalette({ sections, renderIcon }: { sections: NavSection[]; renderIcon: (name: NavSection["items"][number]["icon"]) => React.ReactNode }) {
  const router = useRouter();
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);

  const all = useMemo(() => sections.flatMap((s) => s.items.map((item) => ({ ...item, group: s.title ?? "Général" }))), [sections]);
  const results = useMemo(() => {
    const q = normalize(query.trim());
    if (!q) return all;
    return all.filter((item) => normalize(`${item.label} ${item.group}`).includes(q));
  }, [all, query]);

  const show = () => {
    returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setQuery("");
    setActive(0);
    setOpen(true);
  };
  const hide = () => {
    setOpen(false);
    returnFocus.current?.focus();
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        if (open) hide();
        else show();
      }
    };
    const onOpen = () => show();
    window.addEventListener("keydown", onKey);
    window.addEventListener("yen:command-palette", onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("yen:command-palette", onOpen);
    };
  });

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  if (!open) return null;

  const go = (href: string) => {
    setOpen(false);
    router.push(href);
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center px-4 pt-[12vh]" role="dialog" aria-modal="true" aria-label="Recherche rapide">
      <div className="absolute inset-0 animate-fade-in bg-navy-950/50" onClick={hide} />
      <div className="palette-in relative w-full max-w-xl overflow-hidden rounded-2xl border border-white/60 bg-white shadow-2xl shadow-navy-950/30">
        <div className="flex items-center gap-3 border-b border-border px-4">
          <Search className="size-5 shrink-0 text-slate-400" aria-hidden />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setActive((a) => Math.min(a + 1, results.length - 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setActive((a) => Math.max(a - 1, 0));
              } else if (e.key === "Enter" && results[active]) {
                e.preventDefault();
                go(results[active].href);
              } else if (e.key === "Escape") {
                e.preventDefault();
                hide();
              }
            }}
            placeholder="Rechercher une page…"
            className="h-14 w-full bg-transparent text-base text-navy-950 placeholder:text-slate-400 focus:outline-none"
            role="combobox"
            aria-expanded="true"
            aria-controls={listId}
            aria-activedescendant={results[active] ? `${listId}-${active}` : undefined}
            aria-autocomplete="list"
          />
          <kbd className="hidden rounded-md border border-border bg-slate-50 px-1.5 py-0.5 text-[11px] font-medium text-slate-500 sm:block">Échap</kbd>
        </div>
        <ul id={listId} role="listbox" aria-label="Pages" className="max-h-[50vh] overflow-y-auto p-2">
          {results.length === 0 && <li className="px-3 py-8 text-center text-sm text-muted">Aucune page ne correspond à « {query} ».</li>}
          {results.map((item, i) => (
            <li
              key={item.href}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              onMouseMove={() => setActive(i)}
              onClick={() => go(item.href)}
              className={cn(
                "flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors",
                i === active ? "bg-navy-50 text-navy-900" : "text-slate-600",
              )}
            >
              <span className={cn("grid size-8 shrink-0 place-items-center rounded-lg transition-colors", i === active ? "bg-gold-400 text-navy-950" : "bg-slate-100 text-slate-500")}>
                {renderIcon(item.icon)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{item.label}</span>
                <span className="block truncate text-xs text-muted">{item.group}</span>
              </span>
              {i === active && <CornerDownLeft className="size-4 text-slate-400" aria-hidden />}
            </li>
          ))}
        </ul>
        <div className="flex items-center gap-4 border-t border-border bg-slate-50/80 px-4 py-2 text-[11px] text-slate-500">
          <span>
            <kbd className="font-semibold">↑↓</kbd> naviguer
          </span>
          <span>
            <kbd className="font-semibold">Entrée</kbd> ouvrir
          </span>
          <span className="ml-auto">
            <kbd className="font-semibold">Ctrl K</kbd> ouvrir / fermer
          </span>
        </div>
      </div>
    </div>
  );
}
