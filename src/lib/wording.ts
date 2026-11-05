/**
 * Recommandations enregistrées en base quand les entretiens s'appelaient « évaluations » : affichées
 * avec le mot actuel, sans mise à jour de la base.
 */
export function entretienWording(text: string): string {
  return text.replace(/repasser l['’]évaluation/g, "repasser l'entretien").replace(/de l['’]évaluation/g, "de l'entretien");
}
