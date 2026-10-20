import type { MetadataRoute } from "next";
import { publicEnv } from "@/lib/env";

/**
 * Pages publiques indexables. Les espaces connectés ne sont pas listés ici (ce
 * serait les signaler) : ils renvoient l'en-tête X-Robots-Tag « noindex ».
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/" },
    sitemap: `${publicEnv.siteUrl}/sitemap.xml`,
  };
}
