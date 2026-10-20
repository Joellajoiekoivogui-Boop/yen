import type { MetadataRoute } from "next";
import { publicEnv } from "@/lib/env";

/** Seules les pages publiques sont indexables ; les espaces connectés et l'API sont exclus. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/admin", "/candidat", "/partenaire", "/api/", "/auth/"] },
    sitemap: `${publicEnv.siteUrl}/sitemap.xml`,
  };
}
