import { ClipboardCheck, FileUp, Handshake, Sparkles, UserPlus, UserRoundPen, type LucideIcon } from "lucide-react";

/**
 * Trois temps du parcours : six étapes se retiennent mieux regroupées en trois blocs
 * (se présenter, prouver, être recruté) qu'en une liste plate.
 */
export const HOW_IT_WORKS_PHASES = ["Vous présenter", "Prouver vos compétences", "Être recruté"] as const;

/** Étapes du parcours candidat (page « Fonctionnement » et accueil). `phase` : indice dans HOW_IT_WORKS_PHASES. */
export const HOW_IT_WORKS_STEPS: { t: string; d: string; icon: LucideIcon; phase: 0 | 1 | 2; duration?: string }[] = [
  { t: "Créer son compte", icon: UserPlus, phase: 0, duration: "Moins d'une minute", d: "Inscription avec votre adresse e-mail, sans mot de passe à retenir. Un identifiant YEN unique (ex. YEN-CB-000123) vous est attribué automatiquement." },
  { t: "Compléter son profil", icon: UserRoundPen, phase: 0, d: "Formation suivie chez YEN, établissement, domaine d'intérêt, disponibilité, type d'opportunité recherchée, formations, expériences et projets." },
  { t: "Téléverser son CV", icon: FileUp, phase: 0, d: "Le CV PDF est contrôlé puis stocké de façon privée. Les informations extraites (lorsque l'analyse automatique est activée) vous sont présentées pour validation avant d'être ajoutées au profil." },
  { t: "Passer des entretiens", icon: ClipboardCheck, phase: 1, duration: "15 à 40 minutes par entretien", d: "Questionnaires corrigés automatiquement, études de cas corrigées par un évaluateur YEN. Pas réussi du premier coup ? Vous voyez quoi revoir et vous pouvez réessayer. Le niveau expert n'est jamais attribué par un simple questionnaire." },
  { t: "Recevoir des recommandations", icon: Sparkles, phase: 1, d: "Métiers compatibles avec un score explicable, compétences à confirmer, plan de progression et suggestions pour améliorer votre CV." },
  { t: "Postuler et être accompagné", icon: Handshake, phase: 2, d: "Candidature aux offres publiées, présélection par l'équipe YEN, entretiens, décisions et suivi après placement." },
];
