import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { COLORS } from "@/lib/design-tokens";

const css = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");
const cssToken = (name: string) => css.match(new RegExp(`--color-${name}:\\s*(#[0-9a-fA-F]{6})`))?.[1]?.toLowerCase();

describe("jetons de couleur partagés avec le code", () => {
  it("reprennent exactement les valeurs de globals.css", () => {
    const expected: Record<keyof typeof COLORS, string> = {
      navy100: "navy-100",
      navy600: "navy-600",
      navy700: "navy-700",
      navy900: "navy-900",
      electric500: "electric-500",
      gold400: "gold-400",
      muted: "muted",
      border: "border",
    };
    for (const [key, token] of Object.entries(expected)) {
      expect(COLORS[key as keyof typeof COLORS], `--color-${token}`).toBe(cssToken(token));
    }
  });
});
