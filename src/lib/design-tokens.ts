/**
 * Couleurs de la charte pour le code qui ne lit pas le CSS : graphiques (SVG), métadonnées du
 * navigateur, image d'aperçu des liens. Mêmes valeurs que les jetons de src/app/globals.css :
 * un test (tests/unit/design-tokens.test.ts) vérifie qu'elles restent identiques.
 */
export const COLORS = {
  navy100: "#d6dff2",
  navy600: "#173c85",
  navy700: "#0a2a6c",
  navy900: "#061a47",
  electric500: "#3565dd",
  gold400: "#edb413",
  muted: "#5b6b82",
  border: "#dfe6f0",
} as const;

/**
 * Graphiques : bleu de la charte puis or assombri (#b08209, contraste 3,4:1 sur blanc pour les
 * formes ; le jaune YEN #edb413 n'atteint pas 3:1). Libellés des axes en texte secondaire (5,4:1).
 */
export const CHART = {
  series: [COLORS.electric500, "#b08209"],
  axis: COLORS.muted,
  grid: COLORS.border,
  legend: COLORS.navy900,
  cursor: "rgb(53 101 221 / 0.06)",
} as const;
