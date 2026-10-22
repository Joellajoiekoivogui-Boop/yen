import { publicEnv } from "@/lib/env";

/**
 * Cookies de session : illisibles par JavaScript (httpOnly) — le navigateur
 * n'utilise jamais Supabase directement —, envoyés uniquement en HTTPS en
 * production et jamais depuis un autre site (SameSite=Lax).
 */
export const AUTH_COOKIE_OPTIONS = {
  httpOnly: true,
  // HTTPS : adresse du site en https, ou déploiement Vercel (toujours servi en HTTPS)
  secure: publicEnv.siteUrl.startsWith("https://") || process.env.VERCEL === "1",
  sameSite: "lax" as const,
  path: "/",
};
