import type { MetadataRoute } from "next";
import { publicEnv } from "@/lib/env";
import { listDomains } from "@/features/catalog/queries";

export const revalidate = 3600;

/** Plan du site : pages publiques et fiches des domaines. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = publicEnv.siteUrl;
  const pages = ["", "/presentation", "/fonctionnement", "/domaines", "/partenaires", "/inscription", "/connexion", "/confidentialite", "/conditions"];
  const domains = await listDomains().catch(() => []);
  return [
    ...pages.map((p) => ({ url: `${base}${p}`, changeFrequency: "weekly" as const, priority: p === "" ? 1 : 0.7 })),
    ...domains.map((d) => ({ url: `${base}/domaines/${d.slug}`, changeFrequency: "monthly" as const, priority: 0.6 })),
  ];
}
