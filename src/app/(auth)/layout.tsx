import Link from "next/link";
import { Logo } from "@/components/layout/logo";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-canvas">
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-4 py-5">
        <Logo />
        <Link href="/" className="text-sm text-slate-600 hover:text-navy-900">Retour à l&apos;accueil</Link>
      </header>
      <main id="contenu" className="flex flex-1 items-start justify-center px-4 pb-16">{children}</main>
    </div>
  );
}
