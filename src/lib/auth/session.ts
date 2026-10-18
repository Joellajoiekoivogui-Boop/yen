import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { isSupabaseConfigured } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { STAFF_ROLES, type AppRole } from "@/lib/labels";
import { isPermission, type Permission } from "./permissions";

export interface SessionProfile {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
  city: string | null;
  country: string;
  account_type: "candidate" | "partner" | "staff";
  is_active: boolean;
  is_demo: boolean;
}

export interface SessionContext {
  userId: string;
  email: string;
  emailConfirmed: boolean;
  profile: SessionProfile;
  roles: AppRole[];
  permissions: Set<Permission>;
  candidateId: string | null;
  partnerOrganizationIds: string[];
  isStaff: boolean;
}

/** Contexte de session (mis en cache pour la durée de la requête). */
export const getSession = cache(async (): Promise<SessionContext | null> => {
  // Toute page dépendant de la session est rendue à la requête (jamais pré-rendue)
  await connection();
  if (!isSupabaseConfigured()) return null;
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  const user = auth.user;
  if (!user) return null;

  const [profileRes, rolesRes, permsRes, candRes, membershipRes] = await Promise.all([
    supabase.from("profiles").select("id, first_name, last_name, email, phone, city, country, account_type, is_active, is_demo").eq("id", user.id).maybeSingle(),
    supabase.from("user_roles").select("role").eq("user_id", user.id),
    supabase.rpc("current_permissions"),
    supabase.from("candidate_profiles").select("id").eq("user_id", user.id).maybeSingle(),
    supabase.from("partner_memberships").select("organization_id, status").eq("user_id", user.id).eq("status", "actif"),
  ]);

  if (!profileRes.data) return null;
  const roles = (rolesRes.data ?? []).map((r) => r.role as AppRole);
  const permissions = new Set<Permission>(
    ((permsRes.data as string[] | null) ?? []).filter(isPermission),
  );

  return {
    userId: user.id,
    email: user.email ?? profileRes.data.email,
    emailConfirmed: Boolean(user.email_confirmed_at),
    profile: profileRes.data as SessionProfile,
    roles,
    permissions,
    candidateId: candRes.data?.id ?? null,
    partnerOrganizationIds: roles.includes("partner") ? (membershipRes.data ?? []).map((m) => m.organization_id as string) : [],
    isStaff: roles.some((r) => STAFF_ROLES.includes(r)),
  };
});

/** Espace d'accueil selon les rôles de l'utilisateur. */
export function homePathFor(ctx: SessionContext): string {
  if (ctx.isStaff) return "/admin";
  if (ctx.candidateId) return "/candidat";
  if (ctx.partnerOrganizationIds.length > 0) return "/partenaire";
  if (ctx.profile.account_type === "partner") return "/partenaire/en-attente";
  return "/connexion";
}

export async function requireUser(): Promise<SessionContext> {
  const ctx = await getSession();
  if (!ctx) redirect("/connexion");
  if (!ctx.profile.is_active) redirect("/compte-desactive");
  return ctx;
}

export async function requireCandidate(): Promise<SessionContext & { candidateId: string }> {
  const ctx = await requireUser();
  if (!ctx.candidateId) redirect(homePathFor(ctx));
  return ctx as SessionContext & { candidateId: string };
}

export async function requireStaff(permission?: Permission): Promise<SessionContext> {
  const ctx = await requireUser();
  if (!ctx.isStaff) redirect(homePathFor(ctx));
  if (permission && !ctx.permissions.has(permission)) redirect("/acces-refuse");
  return ctx;
}

export async function requirePartner(): Promise<SessionContext & { organizationId: string }> {
  const ctx = await requireUser();
  if (ctx.partnerOrganizationIds.length === 0) {
    redirect(ctx.profile.account_type === "partner" ? "/partenaire/en-attente" : homePathFor(ctx));
  }
  return { ...ctx, organizationId: ctx.partnerOrganizationIds[0] };
}

export function can(ctx: SessionContext | null, permission: Permission): boolean {
  return Boolean(ctx?.permissions.has(permission));
}
