import Link from "next/link";
import { ArrowLeft, BriefcaseBusiness, Handshake, ShieldCheck } from "lucide-react";
import { Logo } from "@/components/layout/logo";

const PROMISES = [
  { icon: ShieldCheck, title: "Des compétences démontrées", text: "Entretiens, projets et certifications : vos preuves, pas seulement vos déclarations." },
  { icon: BriefcaseBusiness, title: "Des offres adaptées", text: "Stages, emplois et missions classés selon ce que vous savez réellement faire." },
  { icon: Handshake, title: "Un accompagnement YEN", text: "L'équipe YEN vous suit de l'inscription jusqu'à la mise en relation avec les partenaires." },
];

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative isolate flex min-h-dvh bg-canvas">
      {/* Panneau de marque (ordinateur) : reste en place pendant le défilement du formulaire */}
      <aside aria-label="YEN Career Bridge" className="hidden w-[40%] max-w-xl shrink-0 bg-navy-950 text-white lg:block">
        <div className="sticky top-0 flex h-dvh flex-col justify-between overflow-hidden p-10 xl:p-12">
          <Logo inverted className="relative" />
          <div data-reveal-children className="relative max-w-md">
            <p className="text-sm font-medium text-navy-200">Youth Engineers Network · Guinée</p>
            <p className="mt-4 font-heading text-3xl leading-tight font-bold tracking-tight xl:text-[2.5rem]">
              Vos compétences, <span className="text-gold-300">prouvées</span> et visibles.
            </p>
            <ul className="mt-8 space-y-5">
              {PROMISES.map(({ icon: Icon, title, text }) => (
                <li key={title} className="flex gap-3.5">
                  <span className="grid size-10 shrink-0 place-items-center rounded-xl text-gold-300 ring-1 ring-white/15">
                    <Icon className="size-5" aria-hidden />
                  </span>
                  <span>
                    <span className="block text-sm font-semibold">{title}</span>
                    <span className="mt-0.5 block text-sm leading-relaxed text-navy-200">{text}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <p className="relative text-xs text-navy-300">Vos données personnelles restent protégées et ne sont partagées qu&apos;avec votre accord.</p>
        </div>
      </aside>

      <div className="relative flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="flex w-full animate-header-in items-center justify-between gap-4 px-4 py-5 sm:px-8">
          <Logo className="lg:invisible" />
          <Link href="/" className="group inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-sm text-slate-600 transition-colors hover:bg-white hover:text-navy-900">
            <ArrowLeft className="size-4 transition-transform duration-300 group-hover:-translate-x-0.5" aria-hidden />
            Retour à l&apos;accueil
          </Link>
        </header>
        <main id="contenu" data-reveal-children className="flex flex-1 items-start justify-center px-4 pt-2 pb-16 sm:px-8 lg:items-center lg:pt-0">
          {children}
        </main>
      </div>
    </div>
  );
}
