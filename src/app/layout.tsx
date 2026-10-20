import type { Metadata, Viewport } from "next";
import "./globals.css";
import { MotionEngine } from "@/components/motion/motion-engine";

export const metadata: Metadata = {
  title: { default: "YEN Career Bridge", template: "%s · YEN Career Bridge" },
  description:
    "Plateforme de gestion des talents et d'insertion professionnelle du Youth Engineers Network : identifier les talents, renforcer les compétences et faciliter l'accès au stage et à l'emploi.",
  applicationName: "YEN Career Bridge",
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: "#0a2a6c",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fr">
      <body className="min-h-dvh">
        <a href="#contenu" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-white focus:px-3 focus:py-2 focus:shadow">
          Aller au contenu
        </a>
        {children}
        <MotionEngine />
      </body>
    </html>
  );
}
