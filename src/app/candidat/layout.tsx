import Link from "next/link";
import { AppShell, type NavSection } from "@/components/layout/app-shell";
import { Alert } from "@/components/ui";
import { requireCandidate } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { fullName } from "@/lib/utils";

export default async function CandidateLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireCandidate();
  const supabase = await createClient();
  const { count: unread } = await supabase.from("notifications").select("id", { count: "exact", head: true }).eq("user_id", ctx.userId).is("read_at", null);

  const sections: NavSection[] = [
    { items: [{ href: "/candidat", label: "Tableau de bord", short: "Accueil", icon: "LayoutDashboard", exact: true }] },
    {
      title: "Mon parcours",
      items: [
        { href: "/candidat/profil", label: "Mon profil", icon: "User" },
        { href: "/candidat/cv", label: "Mon CV", icon: "FileText" },
        { href: "/candidat/competences", label: "Mes compétences", icon: "Target" },
        { href: "/candidat/evaluations", label: "Mes évaluations", short: "Évaluations", icon: "ClipboardCheck" },
        { href: "/candidat/projets", label: "Mes projets", icon: "FolderKanban" },
        { href: "/candidat/certifications", label: "Mes certifications", icon: "Trophy" },
      ],
    },
    {
      title: "Carrière",
      items: [
        { href: "/candidat/metiers", label: "Métiers recommandés", icon: "Sparkles" },
        { href: "/candidat/offres", label: "Offres d'emploi et de stage", short: "Offres", icon: "Briefcase" },
        { href: "/candidat/candidatures", label: "Mes candidatures", short: "Candidatures", icon: "Send" },
        { href: "/candidat/progression", label: "Mon plan de progression", icon: "Route" },
        { href: "/candidat/assistant", label: "Assistant IA", icon: "Bot" },
      ],
    },
    {
      title: "Compte",
      items: [
        { href: "/candidat/notifications", label: "Notifications", icon: "Bell", badge: unread ?? 0 },
        { href: "/candidat/parametres", label: "Paramètres et confidentialité", icon: "Settings" },
      ],
    },
  ];

  return (
    <AppShell
      sections={sections}
      homeHref="/candidat"
      spaceLabel="Espace candidat"
      mobileNav={["/candidat", "/candidat/offres", "/candidat/evaluations", "/candidat/candidatures"]}
      user={{ name: fullName(ctx.profile), email: ctx.email, roleLabel: "Candidat" }}
      topBanner={
        <>
          {ctx.profile.is_demo && <Alert tone="warning" className="mb-4" title="Compte de démonstration">Ce compte et ses données sont fictifs.</Alert>}
          {!ctx.profile.phone?.trim() && (
            <Alert tone="error" className="mb-4" title="Numéro de téléphone obligatoire">
              Ajoutez votre numéro dans <Link href="/candidat/profil" className="font-semibold underline">Mon profil</Link> : sans lui, l&apos;équipe YEN ne peut pas vous contacter et vous ne pouvez pas postuler aux offres.
            </Alert>
          )}
        </>
      }
    >
      {children}
    </AppShell>
  );
}
