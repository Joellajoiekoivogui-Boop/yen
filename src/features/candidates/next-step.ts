import type { CompletionItem } from "./completion";

/**
 * « Votre prochaine étape » : une seule action conseillée sur le tableau de bord du candidat.
 *
 * Design comportemental : une action claire, courte et expliquée se fait beaucoup plus
 * souvent qu'une liste de huit choses à faire (surcharge de choix). L'ordre suit ce qui
 * débloque le plus la suite : finir un entretien commencé (le temps tourne), choisir son
 * domaine (sans lui, ni entretiens ni offres ne sont ciblés), déclarer puis démontrer ses
 * compétences, et seulement ensuite le reste du profil et les offres.
 * Ton : on propose et on explique pourquoi (motivation autonome), sans injonction.
 */
export interface NextStepInput {
  /** entretien commencé dont le temps n'est pas écoulé */
  attemptInProgress: { id: string; title: string; minutesLeft: number } | null;
  completionItems: CompletionItem[];
  /** compétence déclarée mais pas encore démontrée */
  skillToDemonstrate: string | null;
  /** recommandation active la plus prioritaire */
  recommendation: { title: string } | null;
  /** offre la plus compatible */
  bestOffer: { id: string; title: string; score: number } | null;
}

export interface NextStep {
  key: string;
  title: string;
  /** pourquoi cette étape aide (une phrase) */
  why: string;
  /** durée estimée, pour montrer que c'est faisable maintenant */
  duration: string;
  href: string;
  cta: string;
}

const item = (items: CompletionItem[], key: string) => items.find((i) => i.key === key && !i.done);

export function nextStep(i: NextStepInput): NextStep {
  if (i.attemptInProgress) {
    const left = Math.max(0, Math.round(i.attemptInProgress.minutesLeft));
    return {
      key: "reprendre",
      title: `Terminez votre entretien « ${i.attemptInProgress.title} »`,
      why: "Vos réponses sont gardées sur cet appareil : il ne reste qu'à les relire et à les soumettre.",
      duration: left > 0 ? `${left} min restantes` : "Moins d'une minute",
      href: `/candidat/evaluations/tentative/${i.attemptInProgress.id}`,
      cta: "Reprendre l'entretien",
    };
  }
  const orientation = item(i.completionItems, "orientation");
  if (orientation) {
    return {
      key: "orientation",
      title: "Choisissez votre domaine principal",
      why: "Les entretiens et les offres qui vous sont proposés en dépendent.",
      duration: "1 minute",
      href: orientation.href,
      cta: "Choisir mon domaine",
    };
  }
  const skills = item(i.completionItems, "competences");
  if (skills) {
    return {
      key: "competences",
      title: "Indiquez au moins 3 compétences",
      why: "Elles servent de point de départ : vous les démontrerez ensuite par des entretiens.",
      duration: "3 minutes",
      href: skills.href,
      cta: "Ajouter mes compétences",
    };
  }
  if (i.skillToDemonstrate) {
    return {
      key: "demontrer",
      title: `Démontrez « ${i.skillToDemonstrate} »`,
      why: "Une compétence démontrée par un entretien compte bien plus, pour les recruteurs, qu'une compétence seulement déclarée.",
      duration: "15 à 40 minutes",
      href: "/candidat/evaluations",
      cta: "Choisir un entretien",
    };
  }
  const cv = item(i.completionItems, "cv");
  if (cv) {
    return { key: "cv", title: "Ajoutez votre CV", why: "Les recruteurs partenaires le consultent avant tout entretien.", duration: "2 minutes", href: cv.href, cta: "Ajouter mon CV" };
  }
  const other = i.completionItems.find((x) => !x.done);
  if (other) {
    return { key: other.key, title: `Complétez : ${other.label.charAt(0).toLowerCase()}${other.label.slice(1)}`, why: "Un profil complet est mieux classé dans les recherches de l'équipe YEN.", duration: "2 à 5 minutes", href: other.href, cta: "Compléter" };
  }
  if (i.recommendation) {
    return { key: "recommandation", title: i.recommendation.title, why: "C'est la priorité de votre plan de progression.", duration: "À votre rythme", href: "/candidat/progression", cta: "Voir mon plan" };
  }
  if (i.bestOffer) {
    return {
      key: "offre",
      title: `Découvrez l'offre « ${i.bestOffer.title} »`,
      why: `C'est l'offre la plus compatible avec vos compétences démontrées (${i.bestOffer.score}/100).`,
      duration: "2 minutes",
      href: `/candidat/offres/${i.bestOffer.id}`,
      cta: "Voir l'offre",
    };
  }
  return { key: "entretien", title: "Passez un nouvel entretien", why: "Chaque compétence démontrée élargit les offres qui vous correspondent.", duration: "15 à 40 minutes", href: "/candidat/evaluations", cta: "Choisir un entretien" };
}
