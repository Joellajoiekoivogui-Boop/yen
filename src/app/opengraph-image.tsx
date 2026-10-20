import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";

export const alt = "YEN Career Bridge — talents, compétences et insertion professionnelle";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** Aperçu affiché lors du partage d'un lien (WhatsApp, Facebook, LinkedIn…). */
export default async function OpenGraphImage() {
  const logo = await readFile(join(process.cwd(), "src/assets/brand/yen-logo-white.png"));
  const logoSrc = `data:image/png;base64,${logo.toString("base64")}`;
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: "64px 72px", background: "linear-gradient(135deg, #061a45 0%, #0a2a6c 60%, #123a8a 100%)", color: "white" }}>
        <img src={logoSrc} width={300} height={137} alt="" />
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 72, fontWeight: 700, letterSpacing: -1.5 }}>YEN Career Bridge</div>
          <div style={{ marginTop: 18, fontSize: 32, color: "#c9d6f2", maxWidth: 900 }}>
            Identifier les talents, renforcer les compétences et faciliter l&apos;accès au stage et à l&apos;emploi.
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{ width: 64, height: 8, borderRadius: 4, background: "#edb413" }} />
          <div style={{ fontSize: 26, color: "#edb413", fontWeight: 600 }}>Youth Engineers Network · Guinée</div>
        </div>
      </div>
    ),
    size,
  );
}
