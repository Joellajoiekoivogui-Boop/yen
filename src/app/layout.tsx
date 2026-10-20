import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Suspense } from "react";
import { MotionEngine } from "@/components/motion/motion-engine";
import { NavigationProgress } from "@/components/feedback/navigation-progress";
import { Toaster } from "@/components/feedback/toast";
import { publicEnv } from "@/lib/env";

const DESCRIPTION =
  "Plateforme de gestion des talents et d'insertion professionnelle du Youth Engineers Network : identifier les talents, renforcer les compétences et faciliter l'accès au stage et à l'emploi.";

export const metadata: Metadata = {
  metadataBase: new URL(publicEnv.siteUrl),
  title: { default: "YEN Career Bridge", template: "%s · YEN Career Bridge" },
  description: DESCRIPTION,
  applicationName: "YEN Career Bridge",
  robots: { index: true, follow: true },
  // aperçu lors du partage d'un lien (image générée par app/opengraph-image.tsx)
  openGraph: { type: "website", locale: "fr_FR", siteName: "YEN Career Bridge", title: "YEN Career Bridge", description: DESCRIPTION },
  twitter: { card: "summary_large_image", title: "YEN Career Bridge", description: DESCRIPTION },
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
        <Suspense fallback={null}>
          <NavigationProgress />
        </Suspense>
        {children}
        <Toaster />
        <MotionEngine />
      </body>
    </html>
  );
}
