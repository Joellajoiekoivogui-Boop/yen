import "server-only";

/**
 * Nombre de lignes d'une requête « head » transmis sans l'attendre : la page s'affiche
 * aussitôt et le compteur (pastille du menu) arrive dès qu'il est prêt. Une erreur donne 0.
 */
export function deferredCount(query: PromiseLike<{ count: number | null }>): Promise<number> {
  return Promise.resolve(query).then(
    (r) => r.count ?? 0,
    () => 0,
  );
}
