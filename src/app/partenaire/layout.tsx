import { AppShell, type NavSection } from "@/components/layout/app-shell";
import { requireUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { fullName } from "@/lib/utils";

/**
 * L'accès est contrôlé page par page (requirePartner) : la page « en attente »
 * reste accessible aux comptes partenaires non encore validés.
 */
export default async function PartnerLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireUser();
  const active = ctx.partnerOrganizationIds.length > 0;
  const supabase = await createClient();
  const { count: unread } = await supabase.from("notifications").select("id", { count: "exact", head: true }).eq("user_id", ctx.userId).is("read_at", null);
  const sections: NavSection[] = active
    ? [
        { items: [{ href: "/partenaire", label: "Tableau de bord", short: "Accueil", icon: "LayoutDashboard", exact: true }] },
        {
          title: "Recrutement",
          items: [
            { href: "/partenaire/offres", label: "Mes offres", short: "Offres", icon: "Briefcase" },
            { href: "/partenaire/candidatures", label: "Candidatures reçues", short: "Candidatures", icon: "Send" },
            { href: "/partenaire/profils", label: "Profils partagés", short: "Profils", icon: "Users" },
          ],
        },
        {
          title: "Compte",
          items: [
            { href: "/partenaire/organisation", label: "Mon organisation", icon: "Building2" },
            { href: "/partenaire/notifications", label: "Notifications", icon: "Bell", badge: unread ?? 0 },
          ],
        },
      ]
    : [{ items: [{ href: "/partenaire/en-attente", label: "Statut de la demande", icon: "Building2" }] }];
  return (
    <AppShell
      sections={sections}
      homeHref={active ? "/partenaire" : "/partenaire/en-attente"}
      spaceLabel="Espace partenaire"
      mobileNav={active ? ["/partenaire", "/partenaire/offres", "/partenaire/candidatures", "/partenaire/profils"] : []}
      user={{ name: fullName(ctx.profile), email: ctx.email, roleLabel: "Partenaire / recruteur" }}
    >
      {children}
    </AppShell>
  );
}
