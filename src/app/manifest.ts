import type { MetadataRoute } from "next";

/** Installation sur l'écran d'accueil du téléphone. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "YEN Career Bridge",
    short_name: "YEN Career",
    description: "Talents, compétences et insertion professionnelle — Youth Engineers Network",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#0a2a6c",
    lang: "fr",
    icons: [
      { src: "/icon.png", sizes: "512x512", type: "image/png" },
      { src: "/apple-icon.png", sizes: "180x180", type: "image/png" },
    ],
  };
}
