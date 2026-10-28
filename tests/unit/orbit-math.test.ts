import { describe, expect, it } from "vitest";
import { ringIndex, ringOffset } from "@/components/public/orbit-math";

describe("roue des domaines", () => {
  it("ramène n'importe quel cran à une position de la roue", () => {
    expect(ringIndex(0, 15)).toBe(0);
    expect(ringIndex(-1, 15)).toBe(14);
    expect(ringIndex(31, 15)).toBe(1);
  });

  it("prend le chemin le plus court, en avant ou en arrière", () => {
    expect(ringOffset(1, 0, 15)).toBe(1);
    expect(ringOffset(14, 0, 15)).toBe(-1);
    expect(ringOffset(0, 14, 15)).toBe(1);
    expect(ringOffset(7, 0, 15)).toBe(7);
    expect(ringOffset(8, 0, 15)).toBe(-7);
  });

  it("ne garde que les trois domaines voisins du centre à l'écran", () => {
    const visible = Array.from({ length: 15 }, (_, i) => i).filter((i) => Math.abs(ringOffset(i, 0, 15)) <= 1);
    expect(visible).toEqual([0, 1, 14]);
  });

  it("fonctionne avec une liste filtrée plus courte", () => {
    expect(ringOffset(2, 0, 4)).toBe(2);
    expect(ringOffset(3, 0, 4)).toBe(-1);
  });
});
