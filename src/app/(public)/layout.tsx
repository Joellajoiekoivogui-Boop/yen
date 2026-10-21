import Link from "next/link";
import { Logo } from "@/components/layout/logo";
import { BackToTop } from "@/components/feedback/back-to-top";
import { cookies } from "next/headers";
import { PublicNav } from "@/components/layout/public-nav";
import { PUBLIC_NAV as NAV } from "@/components/layout/public-nav-links";
import { ButtonLink } from "@/components/ui";

export default async function PublicLayout({ children }: { children: React.ReactNode }) {
  // Présence d'une session (sans requête en base) ; « Mon espace » passe par la connexion, qui redirige vers l'espace du compte
  const signedIn = (await cookies()).getAll().some((c) => /^sb-.+-auth-token(\.\d+)?$/.test(c.name));
  return (
    <div className="flex min-h-dvh flex-col bg-white">
      <header className="site-header sticky top-0 z-30 animate-header-in border-b border-border/70 bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <Logo compact />
          <PublicNav variant="desktop" />
          <div className="flex items-center gap-2">
            {signedIn ? (
              <ButtonLink href="/connexion" variant="secondary" size="sm">Mon espace</ButtonLink>
            ) : (
              <>
                <ButtonLink href="/connexion" variant="ghost" size="sm">Connexion</ButtonLink>
                <ButtonLink href="/inscription" variant="secondary" size="sm" data-magnetic>Créer un compte</ButtonLink>
              </>
            )}
          </div>
        </div>
        <PublicNav variant="mobile" />
        <div aria-hidden className="scroll-progress absolute inset-x-0 bottom-0 h-0.5 bg-gradient-to-r from-navy-700 via-gold-400 to-navy-700" />
      </header>
      <main id="contenu" className="flex-1">{children}</main>
      <BackToTop />
      <footer className="bg-navy-950 text-navy-100">
        <div data-reveal-children className="mx-auto grid max-w-7xl grid-cols-2 gap-8 px-4 py-10 sm:px-6 md:grid-cols-4 lg:px-8">
          <div className="col-span-2">
            <Logo inverted />
            <p className="mt-3 max-w-sm text-sm text-navy-200">
              Plateforme de gestion des talents et d&apos;insertion professionnelle du Youth Engineers Network (YEN). Lancement en Guinée.
            </p>
          </div>
          <div>
            <p className="text-sm font-semibold text-white">Plateforme</p>
            <ul className="mt-3 space-y-2 text-sm">
              {NAV.map((n) => (
                <li key={n.href}><Link href={n.href} className="inline-block transition duration-300 hover:translate-x-1 hover:text-white">{n.label}</Link></li>
              ))}
            </ul>
          </div>
          <div>
            <p className="text-sm font-semibold text-white">Informations légales</p>
            <ul className="mt-3 space-y-2 text-sm">
              <li><Link href="/confidentialite" className="inline-block transition duration-300 hover:translate-x-1 hover:text-white">Politique de confidentialité</Link></li>
              <li><Link href="/conditions" className="inline-block transition duration-300 hover:translate-x-1 hover:text-white">Conditions d&apos;utilisation</Link></li>
            </ul>
            <p className="mt-6 text-sm font-semibold text-white">Espaces</p>
            <ul className="mt-3 space-y-2 text-sm">
              <li><Link href="/connexion" className="inline-block transition duration-300 hover:translate-x-1 hover:text-white">Connexion</Link></li>
              <li><Link href="/inscription" className="inline-block transition duration-300 hover:translate-x-1 hover:text-white">Créer un compte</Link></li>
              <li><Link href="/inscription?type=partenaire" className="inline-block transition duration-300 hover:translate-x-1 hover:text-white">Espace partenaire</Link></li>
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
