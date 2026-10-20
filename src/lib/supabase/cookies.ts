import { publicEnv } from "@/lib/env";

/**
 * Cookies de session : illisibles par JavaScript (httpOnly) — le navigateur
 * n'utilise jamais Supabase directement —, envoyés uniquement en HTTPS en
 * production et jamais depuis un autre site (SameSite=Lax).
 */
export const AUTH_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: publicEnv.siteUrl.startsWith("https://"),
  sameSite: "lax" as const,
  path: "/",
};
