import { describe, expect, it } from "vitest";
import { toCsv } from "@/features/reporting/export";

describe("export CSV des talents", () => {
  it("met chaque cellule entre guillemets et neutralise les formules", () => {
    const csv = toCsv(["Nom", "Ville"], [["Dupont,=cmd|' /C calc'!A0", "=HYPERLINK(\"https://x.test\")"], ["Diallo", null]]);
    const lines = csv.replace(/^﻿/, "").split("\r\n");
    expect(lines[0]).toBe('"Nom";"Ville"');
    // une virgule ne peut plus ouvrir une nouvelle cellule commençant par « = »
    expect(lines[1]).toBe('"Dupont,=cmd|\' /C calc\'!A0";"\'=HYPERLINK(""https://x.test"")"');
    expect(lines[2]).toBe('"Diallo";""');
  });
});
