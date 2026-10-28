/** Position (0 à count − 1) d'un cran de la roue, même négatif ou après plusieurs tours. */
export function ringIndex(step: number, count: number) {
  return ((step % count) + count) % count;
}

/**
 * Écart le plus court de la position `from` à la position `to` sur une roue de `count` positions :
 * positif en avançant, négatif en reculant (14 → 0 sur 15 positions donne 1, pas −14).
 */
export function ringOffset(to: number, from: number, count: number) {
  const ahead = ringIndex(to - from, count);
  return ahead > count / 2 ? ahead - count : ahead;
}
