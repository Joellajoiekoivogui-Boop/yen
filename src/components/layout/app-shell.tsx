"use client";

import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import {
  Bell, BookOpenCheck, Bot, Briefcase, Building2, ClipboardCheck, ClipboardList, FileSearch, FileText, FolderKanban, GraduationCap,
  Handshake, LayoutDashboard, Layers, LineChart, ListChecks, LogOut, Menu, Route, ScrollText, Send, Settings, ShieldCheck, Sparkles,
  Search, Target, Trophy, User, Users, X, type LucideIcon,
} from "lucide-react";
import { CommandPalette, openCommandPalette } from "./command-palette";
import { IntentLink } from "./intent-link";
import { Logo } from "./logo";
import { cn } from "@/lib/utils";

const ICONS = {
  Bell, BookOpenCheck, Bot, Briefcase, Building2, ClipboardCheck, ClipboardList, FileSearch, FileText, FolderKanban, GraduationCap,
  Handshake, LayoutDashboard, Layers, LineChart, ListChecks, Route, ScrollText, Send, Settings, ShieldCheck, Sparkles, Target, Trophy, User, Users,
} satisfies Record<string, LucideIcon>;
export type NavIcon = keyof typeof ICONS;

export interface NavItem {
  href: string;
  label: string;
  icon: NavIcon;
  badge?: number;
  exact?: boolean;
  /** Libellé court pour la barre de navigation mobile. */
  short?: string;
}

export interface NavSection {
  title?: string;
  items: NavItem[];
}

function Icon({ name, className }: { name: NavIcon; className?: string }) {
  const C = ICONS[name];
  return <C className={className} aria-hidden />;
}

/** Coque applicative avec navigation latérale responsive (candidat, administration, partenaire). */
export function AppShell({
  sections,
  homeHref,
  spaceLabel,
  user,
  variant = "light",
  children,
  topBanner,
  mobileNav = [],
}: {
  sections: NavSection[];
  homeHref: string;
  spaceLabel: string;
  user: { name: string; email: string; roleLabel: string };
  variant?: "light" | "dark";
  children: ReactNode;
  topBanner?: ReactNode;
  /** Liens (href) affichés dans la barre de navigation en bas de l'écran sur mobile (4 au maximum). */
  mobileNav?: string[];
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const dark = variant === "dark";

  // rang de chaque lien dans la navigation, pour l'apparition en cascade
  const sectionOffsets = sections.map((_, i) => sections.slice(0, i).reduce((n, sec) => n + sec.items.length, 0));

  const isActive = (item: NavItem) => (item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(item.href + "/"));
  const allItems = sections.flatMap((s) => s.items);
  const bottomItems = mobileNav.map((href) => allItems.find((i) => i.href === href)).filter((i): i is NavItem => Boolean(i)).slice(0, 4);
  const initials = user.name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("") || "?";

  const nav = (
    <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-4" aria-label="Navigation principale">
      {sections.map((s, i) => (
        <div key={i}>
          {s.title && <p className={cn("mb-1.5 px-2 text-[11px] font-semibold tracking-wider uppercase", dark ? "text-navy-300" : "text-slate-500")}>{s.title}</p>}
          <ul className="space-y-0.5">
            {s.items.map((item, j) => {
              const active = isActive(item);
              return (
                <li key={item.href} className="animate-nav-item" style={{ animationDelay: `${40 + (sectionOffsets[i] + j) * 15}ms` }}>
                  <IntentLink
                    href={item.href}
                    onClick={() => setOpen(false)}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "group relative flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium transition-all duration-300",
                      "before:absolute before:top-1/2 before:left-0 before:h-5 before:w-1 before:-translate-y-1/2 before:rounded-r-full before:transition-transform before:duration-300",
                      active ? "before:scale-y-100" : "before:scale-y-0",
                      dark ? "before:bg-gold-300" : "before:bg-gold-400",
                      dark
                        ? active ? "bg-white/10 text-white" : "text-navy-100 hover:bg-white/5 hover:text-white"
                        : active ? "bg-navy-50 text-navy-800" : "text-slate-600 hover:bg-slate-100 hover:text-navy-900",
                    )}
                  >
                    <Icon
                      name={item.icon}
                      className={cn("size-4 shrink-0 transition-transform duration-300 ease-spring group-hover:translate-x-0.5 group-hover:scale-110", active && !dark && "text-navy-700", active && dark && "text-gold-300")}
                    />
                    <span className="truncate">{item.label}</span>
                    {item.badge ? (
                      <span className={cn("ml-auto animate-pop-in rounded-full px-1.5 text-[11px] font-semibold", dark ? "bg-gold-400 text-navy-950" : "bg-electric-600 text-white")}>{item.badge}</span>
                    ) : null}
                  </IntentLink>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );

  const userBox = (
    <div className={cn("border-t px-4 py-3", dark ? "border-white/10" : "border-border")}>
      <div className="flex items-center gap-3">
        <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-full bg-gradient-to-br from-navy-600 to-navy-800 text-xs font-bold text-gold-300 ring-2 ring-gold-400/60">
          {initials}
        </span>
        <div className="min-w-0">
          <p className={cn("truncate text-sm font-semibold", dark ? "text-white" : "text-navy-900")}>{user.name}</p>
          <p className={cn("truncate text-xs", dark ? "text-navy-200" : "text-muted")}>{user.roleLabel}</p>
        </div>
      </div>
      <form action="/auth/deconnexion" method="post" className="mt-2">
        <button type="submit" className={cn("inline-flex items-center gap-1.5 text-xs font-medium", dark ? "text-gold-300 hover:text-gold-200" : "text-electric-700 hover:text-electric-800")}>
          <LogOut className="size-3.5" aria-hidden /> Se déconnecter
        </button>
      </form>
    </div>
  );

  const sidebarCls = cn("flex h-full w-64 flex-col", dark ? "bg-navy-900" : "border-r border-border bg-white");

  const searchButton = (
    <button
      type="button"
      onClick={openCommandPalette}
      className={cn(
        "mx-3 mt-3 flex items-center gap-2 rounded-xl border px-3 py-2 text-sm transition duration-300",
        dark ? "border-white/10 bg-white/5 text-navy-200 hover:border-gold-300/40 hover:bg-white/10" : "border-border bg-slate-50 text-slate-500 hover:border-navy-200 hover:bg-white hover:shadow-sm",
      )}
    >
      <Search className="size-4 shrink-0" aria-hidden />
      <span className="flex-1 text-left">Rechercher…</span>
      <kbd className={cn("rounded-md border px-1.5 text-[10px] font-semibold", dark ? "border-white/15 text-navy-200" : "border-border bg-white text-slate-500")}>Ctrl K</kbd>
    </button>
  );

  return (
    <div className="relative isolate min-h-dvh lg:pl-64">
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-96 bg-[radial-gradient(70%_100%_at_50%_0%,rgb(53_101_221/0.09),transparent_70%)] lg:left-64" />
      <CommandPalette sections={sections} renderIcon={(name) => <Icon name={name} className="size-4" />} />
      {/* Barre latérale fixe (ordinateur) */}
      <aside className={cn(sidebarCls, "fixed inset-y-0 left-0 z-30 hidden animate-sidebar-in lg:flex")}>
        <div className={cn("flex h-16 items-center px-4", dark ? "border-b border-white/10" : "border-b border-border")}>
          <Logo href={homeHref} inverted={dark} />
        </div>
        <p className={cn("px-5 pt-3 text-xs font-medium", dark ? "text-gold-300" : "text-gold-600")}>{spaceLabel}</p>
        {searchButton}
        {nav}
        {userBox}
      </aside>

      {/* Barre supérieure (mobile/tablette) */}
      <header className={cn("sticky top-0 z-20 flex h-14 items-center justify-between px-4 lg:hidden", dark ? "bg-navy-900" : "border-b border-border bg-white")}>
        <Logo href={homeHref} inverted={dark} />
        <div className="flex items-center gap-1">
          <button type="button" onClick={openCommandPalette} className={cn("rounded-xl p-2 transition", dark ? "text-white hover:bg-white/10" : "text-navy-800 hover:bg-navy-50")} aria-label="Rechercher une page">
            <Search className="size-5" />
          </button>
          <button type="button" onClick={() => setOpen(true)} className={cn("rounded-xl p-2 transition", dark ? "text-white hover:bg-white/10" : "text-navy-800 hover:bg-navy-50")} aria-label="Ouvrir le menu" aria-expanded={open}>
            <Menu className="size-5" />
          </button>
        </div>
      </header>

      {open && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <div className="absolute inset-0 animate-fade-in bg-navy-950/40 backdrop-blur-[2px]" onClick={() => setOpen(false)} />
          <div className={cn("absolute inset-y-0 left-0 animate-drawer-in shadow-xl", sidebarCls)}>
            <div className={cn("flex h-14 items-center justify-between px-4", dark ? "border-b border-white/10" : "border-b border-border")}>
              <Logo href={homeHref} inverted={dark} />
              <button type="button" onClick={() => setOpen(false)} className={cn("rounded-md p-2", dark ? "text-white" : "text-navy-800")} aria-label="Fermer le menu">
                <X className="size-5" />
              </button>
            </div>
            {nav}
            {userBox}
          </div>
        </div>
      )}

      <main id="contenu" data-app className={cn("mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8", bottomItems.length > 0 && "pb-28 lg:pb-8")}>
        {topBanner}
        {children}
      </main>

      {/* Barre de navigation en bas de l'écran (mobile) */}
      {bottomItems.length > 0 && (
        <nav
          aria-label="Navigation rapide"
          className={cn(
            "fixed inset-x-0 bottom-0 z-30 border-t pb-[env(safe-area-inset-bottom)] backdrop-blur-xl lg:hidden",
            dark ? "border-white/10 bg-navy-900/95" : "border-border/70 bg-white/90",
          )}
        >
          <ul className="mx-auto grid max-w-md grid-cols-5">
            {bottomItems.map((item) => {
              const active = isActive(item);
              return (
                <li key={item.href}>
                  <IntentLink
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={cn("group flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium transition-colors", dark ? (active ? "text-white" : "text-navy-200") : active ? "text-navy-900" : "text-slate-500")}
                  >
                    <span
                      className={cn(
                        "relative grid h-7 w-12 place-items-center rounded-full transition-all duration-300 ease-spring",
                        active ? (dark ? "bg-gold-400 text-navy-950" : "bg-navy-800 text-gold-300") : "group-active:scale-90",
                      )}
                    >
                      <Icon name={item.icon} className="size-[18px]" />
                      {item.badge ? <span className="absolute -top-1 right-1.5 grid min-w-4 animate-pop-in place-items-center rounded-full bg-red-500 px-1 text-[10px] leading-4 font-bold text-white">{item.badge}</span> : null}
                    </span>
                    <span className="max-w-[4.75rem] truncate">{item.short ?? item.label}</span>
                  </IntentLink>
                </li>
              );
            })}
            <li>
              <button
                type="button"
                onClick={() => setOpen(true)}
                className={cn("flex w-full flex-col items-center gap-0.5 py-2 text-[11px] font-medium", dark ? "text-navy-200" : "text-slate-500")}
                aria-label="Ouvrir le menu complet"
              >
                <span className="grid h-7 w-12 place-items-center rounded-full transition active:scale-90">
                  <Menu className="size-[18px]" aria-hidden />
                </span>
                Menu
              </button>
            </li>
          </ul>
        </nav>
      )}
    </div>
  );
}
