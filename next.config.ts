import type { NextConfig } from "next";

// La politique de sécurité du contenu (avec nonce) est posée à chaque requête par src/proxy.ts.
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), bluetooth=(), serial=(), hid=(), browsing-topics=(), interest-cohort=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
  { key: "Origin-Agent-Cluster", value: "?1" },
  { key: "X-Permitted-Cross-Domain-Policies", value: "none" },
  { key: "X-DNS-Prefetch-Control", value: "off" },
];

// Espaces connectés et API : jamais indexés par les moteurs de recherche
const noIndex = [{ key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" }];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  experimental: {
    // Téléversement de CV (limite applicative configurable, plafond technique 12 Mo)
    serverActions: { bodySizeLimit: "12mb" },
    proxyClientMaxBodySize: "12mb",
    // Cache de navigation côté navigateur : revenir sur une page visitée il y a moins de
    // 30 s est instantané (vidé à chaque action qui modifie des données).
    staleTimes: { dynamic: 30, static: 180 },
  },
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      ...["/admin/:path*", "/candidat/:path*", "/partenaire/:path*", "/api/:path*", "/auth/:path*"].map((source) => ({ source, headers: noIndex })),
    ];
  },
};

export default nextConfig;
