/**
 * Catalogue des permissions (miroir de la table public.permissions).
 * La source de vérité est la base de données : ces constantes ne servent qu'au
 * typage et à l'affichage. Toute autorisation est revérifiée côté serveur et
 * par les politiques RLS.
 */
export const PERMISSIONS = [
  "users.manage",
  "roles.manage",
  "candidates.read",
  "candidates.manage",
  "documents.read",
  "notes.manage",
  "assessments.manage",
  "assessments.review",
  "catalog.manage",
  "partners.manage",
  "offers.manage",
  "applications.manage",
  "shares.manage",
  "placements.manage",
  "ai.run",
  "ai.review",
  "reports.view",
  "reports.export",
  "audit.read",
  "settings.manage",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export function isPermission(v: string): v is Permission {
  return (PERMISSIONS as readonly string[]).includes(v);
}
