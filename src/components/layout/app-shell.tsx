"use client";

import { usePathname } from "next/navigation";
import { memo, Suspense, use, useCallback, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
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
  /** Pastille : nombre, ou promesse transmise par le serveur (affichée dès qu'elle est résolue). */
  badge?: number | Promise<number>;
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

/** Pastille de compteur : la navigation s'affiche sans attendre le nombre. */
function Badge({ value, className }: { value: NavItem["badge"]; className: string }) {
  if (value === undefined || value === 0) return null;
  return (
    <Suspense fallback={null}>
      <BadgeValue value={value} className={className} />
    </Suspense>
  );
}
function BadgeValue({ value, className }: { value: number | Promise<number>; className: string }) {
  const n = typeof value === "number" ? value : use(value);
  return n ? <span className={className}>{n}</span> : null;
}

/*
 * Menu complet sur téléphone. Son état vit hors de la coque : l'ouvrir ne redessine ni la page
 * ni la barre latérale, seulement le tiroir (préparé en arrière-plan) et les boutons qui l'ouvrent.
 */
const menuListeners = new Set<() => void>();
let menuOpen = false;
function setMobileMenuOpen(open: boolean) {
  if (menuOpen === open) return;
  menuOpen = open;
  menuListeners.forEach((l) => l());
}
function useMobileMenuOpen() {
  return useSyncExternalStore(
    (l) => {
      menuListeners.add(l);
      return () => menuListeners.delete(l);
    },
    () => menuOpen,
    () => false,
  );
}

/** Exécute fn une fois l'image suivante affichée. */
const afterPaint = (fn: () => void) => requestAnimationFrame(() => setTimeout(fn, 0));

const isActiveItem = (pathname: string, item: NavItem) => (item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(item.href + "/"));

/** Liens de navigation (barre latérale et tiroir) : ne se redessinent qu'au changement de page. */
const NavList = memo(function NavList({ sections, dark, onNavigate }: { sections: NavSection[]; dark: boolean; onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-4" aria-label="Navigation principale">
      {sections.map((s, i) => (
        <div key={i}>
          {s.title && <p className={cn("mb-1.5 px-2 text-2xs font-semibold tracking-wider uppercase", dark ? "text-navy-300" : "text-slate-500")}>{s.title}</p>}
          <ul className="space-y-0.5">
            {s.items.map((item) => {
              const active = isActiveItem(pathname, item);
              return (
                <li key={item.href}>
                  <IntentLink
                    href={item.href}
                    onClick={onNavigate}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      // page courante : simple fond plein et texte plus appuyé (pas de barre de couleur)
                      "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors duration-200",
                      dark
                        ? active ? "bg-white/10 font-semibold text-white" : "font-medium text-navy-100 hover:bg-white/5 hover:text-white"
                        : active ? "bg-navy-50 font-semibold text-navy-950" : "font-medium text-slate-600 hover:bg-slate-100 hover:text-navy-900",
                    )}
                  >
                    <Icon
                      name={item.icon}
                      className={cn("size-4 shrink-0", active ? (dark ? "text-white" : "text-navy-800") : "opacity-80")}
                    />
                    <span className="truncate">{item.label}</span>
                    <Badge value={item.badge} className={cn("ml-auto animate-pop-in rounded-full px-1.5 text-2xs font-semibold", dark ? "bg-gold-400 text-navy-950" : "bg-electric-600 text-white")} />
                  </IntentLink>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
});

/** Bouton qui ouvre le menu complet (seul ce bouton se redessine pour aria-expanded). */
function MobileMenuButton({ className, label, children }: { className: string; label: string; children: ReactNode }) {
  const open = useMobileMenuOpen();
  return (
    <button type="button" onClick={() => setMobileMenuOpen(true)} className={className} aria-label={label} aria-expanded={open}>
      {children}
    </button>
  );
}

/**
 * Tiroir du menu complet : construit dès que le navigateur est inactif, puis simplement glissé à
 * l'écran au toucher. Échap le ferme ; le focus y entre puis revient au bouton.
 */
const MobileDrawer = memo(function MobileDrawer({ sections, homeHref, dark, sidebarCls, userBox }: { sections: NavSection[]; homeHref: string; dark: boolean; sidebarCls: string; userBox: ReactNode }) {
  const open = useMobileMenuOpen();
  const [ready, setReady] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const close = useCallback(() => setMobileMenuOpen(false), []);

  useEffect(() => {
    const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number; cancelIdleCallback?: (id: number) => void };
    if (w.requestIdleCallback) {
      const id = w.requestIdleCallback(() => setReady(true), { timeout: 2500 });
      return () => w.cancelIdleCallback?.(id);
    }
    const t = window.setTimeout(() => setReady(true), 1200);
    return () => window.clearTimeout(t);
  }, []);

  useEffect(() => {
    if (!open) return;
    opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    // focus déplacé juste après l'affichage : le faire pendant le toucher forcerait une mise en page
    // avant que le tiroir n'apparaisse (ou ne disparaisse)
    afterPaint(() => closeRef.current?.focus({ preventScroll: true }));
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      const back = opener.current;
      afterPaint(() => back?.focus({ preventScroll: true }));
    };
  }, [open, close]);

  // fermé au changement de page (lien suivi, retour arrière)
  const pathname = usePathname();
  useEffect(() => close, [pathname, close]);

  if (!ready && !open) return null;
  // fermé : invisible (ni focus ni lecteur d'écran : visibility hidden), mais déjà mis en page ;
  // l'ouverture ne fait que glisser le tiroir (transform) et éclaircir le fond (opacité)
  return (
    <div
      className={cn("fixed inset-0 z-40 lg:hidden", open ? "visible" : "invisible [transition:visibility_0s_linear_200ms]")}
      role="dialog"
      aria-modal="true"
      aria-label="Menu"
    >
      <div className={cn("absolute inset-0 bg-navy-950/40 transition-opacity duration-300", open ? "opacity-100" : "opacity-0")} onClick={close} />
      {/* panneau flottant détaché du bord, coins arrondis (la hauteur suit l'écran, marges de 8 px) */}
      <div
        className={cn(
          sidebarCls,
          "absolute inset-y-2 left-2 h-auto overflow-hidden rounded-2xl shadow-lg transition-[translate,opacity] duration-300 ease-out-expo",
          open ? "translate-x-0 opacity-100" : "-translate-x-[105%] opacity-0",
          !dark && "border border-border",
        )}
      >
        <div className={cn("flex h-14 items-center justify-between px-4", dark ? "border-b border-white/10" : "border-b border-border")}>
          <Logo href={homeHref} inverted={dark} />
          <button ref={closeRef} type="button" onClick={close} className={cn("rounded-lg p-2 transition-colors", dark ? "text-white hover:bg-white/10" : "text-navy-800 hover:bg-slate-100")} aria-label="Fermer le menu">
            <X className="size-5" />
          </button>
        </div>
        <NavList sections={sections} dark={dark} onNavigate={close} />
        {userBox}
      </div>
    </div>
  );
});

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
  const dark = variant === "dark";

  const isActive = (item: NavItem) => isActiveItem(pathname, item);
  const allItems = sections.flatMap((s) => s.items);
  const bottomItems = mobileNav.map((href) => allItems.find((i) => i.href === href)).filter((i): i is NavItem => Boolean(i)).slice(0, 4);
  const initials = user.name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("") || "?";

  const userBox = (
    <div className={cn("border-t px-4 py-3", dark ? "border-white/10" : "border-border")}>
      <div className="flex items-center gap-3">
        <span aria-hidden className={cn("grid size-9 shrink-0 place-items-center rounded-full text-xs font-semibold", dark ? "bg-white/10 text-white" : "bg-navy-800 text-white")}>
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
      <kbd className={cn("rounded-md border px-1.5 text-2xs font-semibold", dark ? "border-white/15 text-navy-200" : "border-border bg-white text-slate-500")}>Ctrl K</kbd>
    </button>
  );

  return (
    <div className="relative isolate min-h-dvh lg:pl-64">
      <CommandPalette sections={sections} renderIcon={(name) => <Icon name={name} className="size-4" />} />
      {/* Barre latérale fixe (ordinateur) */}
      <aside className={cn(sidebarCls, "fixed inset-y-0 left-0 z-30 hidden animate-sidebar-in lg:flex")}>
        <div className={cn("flex h-16 items-center px-4", dark ? "border-b border-white/10" : "border-b border-border")}>
          <Logo href={homeHref} inverted={dark} />
        </div>
        <p className={cn("px-5 pt-3 text-xs font-medium", dark ? "text-gold-300" : "text-gold-600")}>{spaceLabel}</p>
        {searchButton}
        <NavList sections={sections} dark={dark} />
        {userBox}
      </aside>

      {/* Barre supérieure (mobile/tablette) */}
      <header className={cn("sticky top-0 z-20 flex h-14 items-center justify-between px-4 lg:hidden", dark ? "bg-navy-900" : "border-b border-border bg-white")}>
        <Logo href={homeHref} inverted={dark} />
        <div className="flex items-center gap-1">
          <button type="button" onClick={openCommandPalette} className={cn("rounded-xl p-2 transition", dark ? "text-white hover:bg-white/10" : "text-navy-800 hover:bg-navy-50")} aria-label="Rechercher une page">
            <Search className="size-5" />
          </button>
          <MobileMenuButton className={cn("rounded-xl p-2 transition", dark ? "text-white hover:bg-white/10" : "text-navy-800 hover:bg-navy-50")} label="Ouvrir le menu">
            <Menu className="size-5" />
          </MobileMenuButton>
        </div>
      </header>

      <MobileDrawer sections={sections} homeHref={homeHref} dark={dark} sidebarCls={sidebarCls} userBox={userBox} />

      <main id="contenu" data-app className={cn("mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8", bottomItems.length > 0 && "pb-28 lg:pb-8 [@media(max-height:500px)]:pb-8")}>
        {topBanner}
        {children}
      </main>

      {/* Barre de navigation en bas de l'écran (mobile) */}
      {bottomItems.length > 0 && (
        <nav
          aria-label="Navigation rapide"
          className={cn(
            // téléphone en paysage (écran très bas) : barre masquée, le menu de l'en-tête suffit
            "fixed inset-x-0 bottom-0 z-30 border-t pb-[env(safe-area-inset-bottom)] lg:hidden [@media(max-height:500px)]:hidden",
            dark ? "border-white/10 bg-navy-900" : "border-border/70 bg-white/[0.97]",
          )}
        >
          <ul className="mx-auto grid max-w-md grid-cols-5">
            {bottomItems.map((item) => {
              const active = isActive(item);
              return (
                <li key={item.href}>
                  <IntentLink
                    href={item.href}
                    eager={!active}
                    aria-current={active ? "page" : undefined}
                    className={cn("group flex flex-col items-center gap-0.5 py-2 text-2xs font-medium transition-colors", dark ? (active ? "text-white" : "text-navy-200") : active ? "text-navy-900" : "text-slate-500")}
                  >
                    <span
                      className={cn(
                        "relative grid h-7 w-12 place-items-center rounded-full transition-all duration-300 ease-spring",
                        active ? (dark ? "bg-white text-navy-950" : "bg-navy-900 text-white") : "group-active:scale-90",
                      )}
                    >
                      <Icon name={item.icon} className="size-[18px]" />
                      <Badge value={item.badge} className="absolute -top-1 right-1.5 grid min-w-4 animate-pop-in place-items-center rounded-full bg-red-500 px-1 text-2xs leading-4 font-bold text-white" />
                    </span>
                    <span className="max-w-[4.75rem] truncate">{item.short ?? item.label}</span>
                  </IntentLink>
                </li>
              );
            })}
            <li>
              <MobileMenuButton className={cn("flex w-full flex-col items-center gap-0.5 py-2 text-2xs font-medium", dark ? "text-navy-200" : "text-slate-500")} label="Ouvrir le menu complet">
                <span className="grid h-7 w-12 place-items-center rounded-full transition active:scale-90">
                  <Menu className="size-[18px]" aria-hidden />
                </span>
                Menu
              </MobileMenuButton>
            </li>
          </ul>
        </nav>
      )}
    </div>
  );
}
