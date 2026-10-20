import Link from "next/link";
import { Logo } from "@/components/layout/logo";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative isolate flex min-h-dvh flex-col overflow-hidden bg-canvas">
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -top-32 -left-24 size-[28rem] animate-blob rounded-full bg-electric-300/25 blur-3xl" />
        <div className="absolute top-1/3 -right-32 size-[26rem] animate-blob rounded-full bg-gold-300/25 blur-3xl [animation-delay:-7s]" />
        <div className="absolute -bottom-40 left-1/4 size-[24rem] animate-blob rounded-full bg-electric-200/30 blur-3xl [animation-delay:-13s]" />
      </div>
      <header className="mx-auto flex w-full max-w-5xl animate-header-in items-center justify-between px-4 py-5">
        <Logo />
        <Link href="/" className="nav-link text-sm text-slate-600 transition-colors hover:text-navy-900">Retour à l&apos;accueil</Link>
      </header>
      <main id="contenu" data-reveal-children className="flex flex-1 items-start justify-center px-4 pb-16">{children}</main>
    </div>
  );
}
