import { FlaskConical, PhoneCall } from "lucide-react";
import { AppShell, type NavSection } from "@/components/layout/app-shell";
import { ButtonLink } from "@/components/ui";
import { requireCandidate } from "@/lib/auth/session";
import { deferredCount } from "@/lib/supabase/count";
import { createClient } from "@/lib/supabase/server";
import { fullName } from "@/lib/utils";

export default async function CandidateLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireCandidate();
  const supabase = await createClient();
  // compteur de la pastille : chargé en parallèle de la page, sans la retarder
  const unread = deferredCount(supabase.from("notifications").select("id", { count: "exact", head: true }).eq("user_id", ctx.userId).is("read_at", null));

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
        { href: "/candidat/notifications", label: "Notifications", icon: "Bell", badge: unread },
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
          {ctx.profile.is_demo && (
            <p className="mb-4 inline-flex animate-slide-down items-center gap-2 rounded-full bg-violet-50 px-3 py-1 text-xs font-medium text-violet-800 ring-1 ring-violet-200">
              <FlaskConical className="size-3.5 shrink-0" aria-hidden />
              Compte de démonstration · données fictives
            </p>
          )}
          {!ctx.profile.phone?.trim() && (
            <div role="status" className="mb-6 flex animate-slide-down items-start gap-3 rounded-card border border-red-200 bg-gradient-to-r from-red-50 to-white p-4 sm:items-center">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-red-100 text-red-700">
                <PhoneCall className="size-5" aria-hidden />
              </span>
              <div className="flex min-w-0 flex-1 flex-col gap-3 sm:flex-row sm:items-center">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-red-900">Numéro de téléphone obligatoire</p>
                  <p className="mt-0.5 text-sm leading-relaxed text-red-800">Sans lui, l&apos;équipe YEN ne peut pas vous contacter et vous ne pouvez pas postuler aux offres.</p>
                </div>
                <ButtonLink href="/candidat/profil" variant="primary" size="sm" className="self-start sm:self-auto">
                  Ajouter mon numéro
                </ButtonLink>
              </div>
            </div>
          )}
        </>
      }
    >
      {children}
    </AppShell>
  );
}
