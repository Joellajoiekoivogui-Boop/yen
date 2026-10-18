import Link from "next/link";
import { Logo } from "@/components/layout/logo";
import { ButtonLink } from "@/components/ui";
import { getSession, homePathFor } from "@/lib/auth/session";

const NAV = [
  { href: "/presentation", label: "Présentation" },
  { href: "/fonctionnement", label: "Fonctionnement" },
  { href: "/domaines", label: "Domaines" },
  { href: "/partenaires", label: "Partenaires" },
];

export default async function PublicLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession().catch(() => null);
  return (
    <div className="flex min-h-dvh flex-col bg-white">
      <header className="sticky top-0 z-30 border-b border-border/70 bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <Logo />
          <nav className="hidden items-center gap-6 md:flex" aria-label="Navigation publique">
            {NAV.map((n) => (
              <Link key={n.href} href={n.href} className="text-sm font-medium text-slate-600 hover:text-navy-900">
                {n.label}
              </Link>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            {session ? (
              <ButtonLink href={homePathFor(session)} variant="secondary" size="sm">Mon espace</ButtonLink>
            ) : (
              <>
                <ButtonLink href="/connexion" variant="ghost" size="sm">Connexion</ButtonLink>
                <ButtonLink href="/inscription" variant="secondary" size="sm">Créer un compte</ButtonLink>
              </>
            )}
          </div>
        </div>
        <nav className="flex gap-4 overflow-x-auto border-t border-border/60 px-4 py-2 md:hidden" aria-label="Navigation publique (mobile)">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className="text-sm whitespace-nowrap text-slate-600">
              {n.label}
            </Link>
          ))}
        </nav>
      </header>
      <main id="contenu" className="flex-1">{children}</main>
      <footer className="bg-navy-950 text-navy-100">
        <div className="mx-auto grid max-w-7xl gap-8 px-4 py-10 sm:px-6 md:grid-cols-3 lg:px-8">
          <div>
            <Logo inverted />
            <p className="mt-3 max-w-sm text-sm text-navy-200">
              Plateforme de gestion des talents et d&apos;insertion professionnelle du Youth Engineers Network (YEN). Lancement en Guinée.
            </p>
          </div>
          <div>
            <p className="text-sm font-semibold text-white">Plateforme</p>
            <ul className="mt-3 space-y-2 text-sm">
              {NAV.map((n) => (
                <li key={n.href}><Link href={n.href} className="hover:text-white">{n.label}</Link></li>
              ))}
            </ul>
          </div>
          <div>
            <p className="text-sm font-semibold text-white">Informations légales</p>
            <ul className="mt-3 space-y-2 text-sm">
              <li><Link href="/confidentialite" className="hover:text-white">Politique de confidentialité</Link></li>
              <li><Link href="/conditions" className="hover:text-white">Conditions d&apos;utilisation</Link></li>
            </ul>
          </div>
        </div>
        <div className="border-t border-white/10 py-4 text-center text-xs text-navy-300">
          © {new Date().getFullYear()} Youth Engineers Network — YEN Career Bridge
        </div>
      </footer>
    </div>
  );
}
