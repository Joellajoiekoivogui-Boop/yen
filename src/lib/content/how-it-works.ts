import { ClipboardCheck, FileUp, Handshake, Sparkles, UserPlus, UserRoundPen, type LucideIcon } from "lucide-react";

/** Étapes du parcours candidat (page « Fonctionnement » et accueil). */
export const HOW_IT_WORKS_STEPS: { t: string; d: string; icon: LucideIcon }[] = [
  { t: "Créer son compte", icon: UserPlus, d: "Inscription en quelques instants avec votre adresse e-mail. Un identifiant YEN unique (ex. YEN-CB-000123) vous est attribué automatiquement." },
  { t: "Compléter son profil", icon: UserRoundPen, d: "Formation suivie chez YEN, établissement, domaine d'intérêt, disponibilité, type d'opportunité recherchée, formations, expériences et projets." },
  { t: "Téléverser son CV", icon: FileUp, d: "Le CV PDF est contrôlé puis stocké de façon privée. Les informations extraites (lorsque l'analyse automatique est activée) vous sont présentées pour validation avant d'être ajoutées au profil." },
  { t: "Passer des évaluations", icon: ClipboardCheck, d: "Questionnaires corrigés automatiquement, études de cas corrigées par un évaluateur YEN. Le niveau expert n'est jamais attribué par un simple questionnaire." },
  { t: "Recevoir des recommandations", icon: Sparkles, d: "Métiers compatibles avec un score explicable, compétences à confirmer, plan de progression et suggestions pour améliorer votre CV." },
  { t: "Postuler et être accompagné", icon: Handshake, d: "Candidature aux offres publiées, présélection par l'équipe YEN, entretiens, décisions et suivi après placement." },
];
