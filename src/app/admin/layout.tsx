import { AppShell, type NavItem, type NavSection } from "@/components/layout/app-shell";
import { requireStaff } from "@/lib/auth/session";
import type { Permission } from "@/lib/auth/permissions";
import { roleLabel } from "@/lib/labels";
import { deferredCount } from "@/lib/supabase/count";
import { createClient } from "@/lib/supabase/server";
import { fullName } from "@/lib/utils";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireStaff();
  const supabase = await createClient();
  // compteurs des pastilles : chargés en parallèle de la page, sans la retarder
  const unread = deferredCount(supabase.from("notifications").select("id", { count: "exact", head: true }).eq("user_id", ctx.userId).is("read_at", null));
  const toReview = ctx.permissions.has("assessments.review")
    ? deferredCount(supabase.from("assessment_attempts").select("id", { count: "exact", head: true }).eq("status", "en_correction"))
    : 0;
  // demandes d'accès partenaire (nouvelle organisation ou nouveau recruteur) à traiter
  const partnerRequests = ctx.permissions.has("partners.manage")
    ? deferredCount(supabase.from("partner_memberships").select("id", { count: "exact", head: true }).eq("status", "en_attente"))
    : 0;
  const can = (p: Permission) => ctx.permissions.has(p);
  const items = (list: (NavItem & { perm?: Permission })[]) => list.filter((i) => !i.perm || can(i.perm));

  const sections: NavSection[] = [
    { items: [{ href: "/admin", label: "Vue générale", short: "Accueil", icon: "LayoutDashboard" as const, exact: true }] },
    {
      title: "Talents",
      items: items([
        { href: "/admin/talents", label: "Répertoire des talents", short: "Talents", icon: "Users", perm: "candidates.read" },
        { href: "/admin/corrections", label: "Corrections et validations", icon: "ClipboardCheck", perm: "assessments.review", badge: toReview },
        { href: "/admin/evaluations", label: "Évaluations", icon: "ListChecks", perm: "assessments.manage" },
        { href: "/admin/catalogue", label: "Catalogue des métiers", icon: "Layers", perm: "catalog.manage" },
      ]),
    },
    {
      title: "Opportunités",
      items: items([
        { href: "/admin/offres", label: "Offres", icon: "Briefcase", perm: "offers.manage" },
        { href: "/admin/candidatures", label: "Candidatures", icon: "Send", perm: "applications.manage" },
        { href: "/admin/partenaires", label: "Partenaires", icon: "Handshake", perm: "partners.manage", badge: partnerRequests },
        { href: "/admin/placements", label: "Placements", icon: "Trophy", perm: "placements.manage" },
      ]),
    },
    {
      title: "Pilotage",
      items: items([
        { href: "/admin/rapports", label: "Rapports d'insertion", icon: "LineChart", perm: "reports.view" },
        { href: "/admin/utilisateurs", label: "Utilisateurs et rôles", icon: "ShieldCheck", perm: "users.manage" },
        { href: "/admin/audit", label: "Journal d'audit", icon: "ScrollText", perm: "audit.read" },
        { href: "/admin/parametres", label: "Paramètres", icon: "Settings", perm: "settings.manage" },
        { href: "/admin/notifications", label: "Notifications", icon: "Bell", badge: unread },
      ]),
    },
  ].filter((s) => s.items.length > 0);

  return (
    <AppShell
      sections={sections}
      homeHref="/admin"
      spaceLabel="Administration YEN"
      variant="dark"
      mobileNav={["/admin", "/admin/talents", "/admin/candidatures", "/admin/offres"]}
      user={{ name: fullName(ctx.profile), email: ctx.email, roleLabel: ctx.roles.filter((r) => r !== "candidate" && r !== "partner").map((r) => roleLabel[r]).join(", ") }}
    >
      {children}
    </AppShell>
  );
}
