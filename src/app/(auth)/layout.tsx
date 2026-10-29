import type { CSSProperties } from "react";
import Link from "next/link";
import { ArrowLeft, BriefcaseBusiness, Handshake, ShieldCheck } from "lucide-react";
import { Logo } from "@/components/layout/logo";

const PROMISES = [
  { icon: ShieldCheck, title: "Des compétences démontrées", text: "Entretiens, projets et certifications : vos preuves, pas seulement vos déclarations." },
  { icon: BriefcaseBusiness, title: "Des offres adaptées", text: "Stages, emplois et missions classés selon ce que vous savez réellement faire." },
  { icon: Handshake, title: "Un accompagnement YEN", text: "L'équipe YEN vous suit de l'inscription jusqu'à la mise en relation avec les partenaires." },
];

/** Particules du panneau : positions fixes pour un rendu identique serveur / navigateur. */
const PARTICLES = [
  { left: 14, top: 78, size: 4, delay: 0, duration: 8 },
  { left: 32, top: 62, size: 3, delay: 2.4, duration: 9 },
  { left: 58, top: 84, size: 5, delay: 1.1, duration: 7 },
  { left: 76, top: 70, size: 3, delay: 3.6, duration: 10 },
  { left: 88, top: 90, size: 4, delay: 5.2, duration: 8 },
];

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative isolate flex min-h-dvh bg-canvas">
      {/* Panneau de marque (ordinateur) : reste en place pendant le défilement du formulaire */}
      <aside aria-label="YEN Career Bridge" className="hidden w-[40%] max-w-xl shrink-0 bg-navy-950 text-white lg:block">
        <div className="sticky top-0 flex h-dvh flex-col justify-between overflow-hidden p-10 xl:p-12">
          <div aria-hidden className="pointer-events-none absolute inset-0">
            <div className="hero-grid absolute inset-0" />
            <div className="absolute -top-56 -right-48 size-[38rem] animate-blob glow-blob glow-electric opacity-30" />
            <div className="absolute -bottom-64 -left-40 size-[34rem] animate-blob glow-blob glow-gold opacity-20 [animation-delay:-8s]" />
            {PARTICLES.map((p, i) => (
              <span
                key={i}
                className="hero-particle"
                style={{ left: `${p.left}%`, top: `${p.top}%`, width: p.size, height: p.size, "--particle-delay": `${p.delay}s`, "--particle-duration": `${p.duration}s` } as CSSProperties}
              />
            ))}
          </div>
          <Logo inverted className="relative animate-fade-in" />
          <div data-reveal-children className="relative max-w-md">
            <p className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-gold-200 ring-1 ring-white/15">
              <span className="size-1.5 rounded-full bg-gold-300" aria-hidden />
              Youth Engineers Network · Guinée
            </p>
            <p className="mt-5 font-heading text-3xl leading-tight font-bold tracking-tight xl:text-[2.5rem]">
              Vos compétences, <span className="text-shine">prouvées</span> et visibles.
            </p>
            <ul className="mt-8 space-y-5">
              {PROMISES.map(({ icon: Icon, title, text }) => (
                <li key={title} className="flex gap-3.5">
                  <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-white/10 text-gold-300 ring-1 ring-white/15">
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
        <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
          <div className="absolute top-[calc(25%-4rem)] -right-48 size-[34rem] animate-blob glow-blob glow-electric-light opacity-20" />
          <div className="absolute -bottom-56 -left-32 size-[30rem] animate-blob glow-blob glow-gold-light opacity-20 [animation-delay:-9s]" />
        </div>
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
