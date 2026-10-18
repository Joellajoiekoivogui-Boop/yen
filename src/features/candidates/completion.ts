/**
 * Complétion du profil : mesure le niveau de RENSEIGNEMENT du profil.
 * Ce pourcentage n'est jamais une mesure de compétence (cahier des charges §4).
 */
export interface CompletionInput {
  firstName: string;
  lastName: string;
  city: string | null;
  institution: string | null;
  yenProgram: string | null;
  educationLevel: string | null;
  primaryDomainId: string | null;
  opportunityTypes: string[];
  headline: string | null;
  summary: string | null;
  hasCurrentCv: boolean;
  declaredSkillsCount: number;
  educationCount: number;
  experienceOrProjectCount: number;
  consentsAnswered: number;
}

export interface CompletionItem {
  key: string;
  label: string;
  weight: number;
  done: boolean;
  href: string;
}

export function computeCompletion(i: CompletionInput): { percent: number; items: CompletionItem[] } {
  const items: CompletionItem[] = [
    { key: "identite", label: "Nom, prénom et ville", weight: 10, done: Boolean(i.firstName && i.lastName && i.city), href: "/candidat/profil" },
    { key: "formation_yen", label: "Établissement, formation YEN et niveau d'études", weight: 10, done: Boolean(i.institution && i.yenProgram && i.educationLevel), href: "/candidat/profil" },
    { key: "orientation", label: "Domaine principal et opportunités recherchées", weight: 10, done: Boolean(i.primaryDomainId && i.opportunityTypes.length > 0), href: "/candidat/profil" },
    { key: "presentation", label: "Titre et résumé professionnel", weight: 15, done: Boolean(i.headline?.trim() && (i.summary?.trim().length ?? 0) >= 80), href: "/candidat/profil" },
    { key: "cv", label: "CV au format PDF", weight: 15, done: i.hasCurrentCv, href: "/candidat/cv" },
    { key: "competences", label: "Au moins 3 compétences déclarées", weight: 15, done: i.declaredSkillsCount >= 3, href: "/candidat/competences" },
    { key: "parcours", label: "Au moins une formation", weight: 10, done: i.educationCount >= 1, href: "/candidat/profil#formations" },
    { key: "realisations", label: "Au moins une expérience ou un projet", weight: 10, done: i.experienceOrProjectCount >= 1, href: "/candidat/projets" },
    { key: "consentements", label: "Préférences de confidentialité renseignées", weight: 5, done: i.consentsAnswered >= 3, href: "/candidat/parametres" },
  ];
  const total = items.reduce((s, x) => s + x.weight, 0);
  const done = items.filter((x) => x.done).reduce((s, x) => s + x.weight, 0);
  return { percent: Math.round((100 * done) / total), items };
}
