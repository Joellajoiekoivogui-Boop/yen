"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import {
  Bell, BookOpenCheck, Bot, Briefcase, Building2, ClipboardCheck, ClipboardList, FileSearch, FileText, FolderKanban, GraduationCap,
  Handshake, LayoutDashboard, Layers, LineChart, ListChecks, LogOut, Menu, Route, ScrollText, Send, Settings, ShieldCheck, Sparkles,
  Target, Trophy, User, Users, X, type LucideIcon,
} from "lucide-react";
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
}: {
  sections: NavSection[];
  homeHref: string;
  spaceLabel: string;
  user: { name: string; email: string; roleLabel: string };
  variant?: "light" | "dark";
  children: ReactNode;
  topBanner?: ReactNode;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const dark = variant === "dark";

  const isActive = (item: NavItem) => (item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(item.href + "/"));

  const nav = (
    <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-4" aria-label="Navigation principale">
      {sections.map((s, i) => (
        <div key={i}>
          {s.title && <p className={cn("mb-1.5 px-2 text-[11px] font-semibold tracking-wider uppercase", dark ? "text-navy-300" : "text-slate-400")}>{s.title}</p>}
          <ul className="space-y-0.5">
            {s.items.map((item) => {
              const active = isActive(item);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={() => setOpen(false)}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors",
                      dark
                        ? active ? "bg-white/10 text-white" : "text-navy-100 hover:bg-white/5 hover:text-white"
                        : active ? "bg-electric-50 text-electric-700" : "text-slate-600 hover:bg-slate-100 hover:text-navy-900",
                    )}
                  >
                    <Icon name={item.icon} className={cn("size-4 shrink-0", active && !dark && "text-electric-600", active && dark && "text-teal-300")} />
                    <span className="truncate">{item.label}</span>
                    {item.badge ? (
                      <span className={cn("ml-auto rounded-full px-1.5 text-[11px] font-semibold", dark ? "bg-teal-400 text-navy-950" : "bg-electric-600 text-white")}>{item.badge}</span>
                    ) : null}
                  </Link>
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
      <p className={cn("truncate text-sm font-semibold", dark ? "text-white" : "text-navy-900")}>{user.name}</p>
      <p className={cn("truncate text-xs", dark ? "text-navy-200" : "text-muted")}>{user.roleLabel}</p>
      <form action="/auth/deconnexion" method="post" className="mt-2">
        <button type="submit" className={cn("inline-flex items-center gap-1.5 text-xs font-medium", dark ? "text-teal-300 hover:text-teal-200" : "text-electric-700 hover:text-electric-800")}>
          <LogOut className="size-3.5" aria-hidden /> Se déconnecter
        </button>
      </form>
    </div>
  );

  const sidebarCls = cn("flex h-full w-64 flex-col", dark ? "bg-navy-900" : "border-r border-border bg-white");

  return (
    <div className="min-h-dvh lg:pl-64">
      {/* Barre latérale fixe (ordinateur) */}
      <aside className={cn(sidebarCls, "fixed inset-y-0 left-0 z-30 hidden lg:flex")}>
        <div className={cn("flex h-16 items-center px-4", dark ? "border-b border-white/10" : "border-b border-border")}>
          <Logo href={homeHref} inverted={dark} />
        </div>
        <p className={cn("px-5 pt-3 text-xs font-medium", dark ? "text-teal-300" : "text-teal-600")}>{spaceLabel}</p>
        {nav}
        {userBox}
      </aside>

      {/* Barre supérieure (mobile/tablette) */}
      <header className={cn("sticky top-0 z-20 flex h-14 items-center justify-between px-4 lg:hidden", dark ? "bg-navy-900" : "border-b border-border bg-white")}>
        <Logo href={homeHref} inverted={dark} />
        <button type="button" onClick={() => setOpen(true)} className={cn("rounded-md p-2", dark ? "text-white" : "text-navy-800")} aria-label="Ouvrir le menu" aria-expanded={open}>
          <Menu className="size-5" />
        </button>
      </header>

      {open && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <div className="absolute inset-0 bg-navy-950/40" onClick={() => setOpen(false)} />
          <div className={cn("absolute inset-y-0 left-0 shadow-xl", sidebarCls)}>
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

      <main id="contenu" className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        {topBanner}
        {children}
      </main>
    </div>
  );
}
