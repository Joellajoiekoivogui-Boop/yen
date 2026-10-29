/** Libellés français des valeurs énumérées de la base de données. */

export type SkillLevel = "debutant" | "intermediaire" | "avance" | "expert";
export const SKILL_LEVELS: SkillLevel[] = ["debutant", "intermediaire", "avance", "expert"];
export const LEVEL_RANK: Record<SkillLevel, number> = { debutant: 1, intermediaire: 2, avance: 3, expert: 4 };
export const levelLabel: Record<SkillLevel, string> = {
  debutant: "Débutant",
  intermediaire: "Intermédiaire",
  avance: "Avancé",
  expert: "Expert",
};

export type CandidateStatus = "etudiant" | "diplome" | "stagiaire" | "en_recherche";
export const candidateStatusLabel: Record<CandidateStatus, string> = {
  etudiant: "Étudiant",
  diplome: "Diplômé",
  stagiaire: "Stagiaire",
  en_recherche: "En recherche d'emploi",
};

export type OpportunityType = "stage" | "emploi" | "alternance" | "mission";
export const OPPORTUNITY_TYPES: OpportunityType[] = ["stage", "emploi", "alternance", "mission"];
export const opportunityLabel: Record<OpportunityType, string> = {
  stage: "Stage",
  emploi: "Emploi",
  alternance: "Alternance",
  mission: "Mission",
};

export type Availability = "immediate" | "moins_1_mois" | "un_a_trois_mois" | "plus_tard" | "indisponible";
export const availabilityLabel: Record<Availability, string> = {
  immediate: "Immédiate",
  moins_1_mois: "Sous 1 mois",
  un_a_trois_mois: "1 à 3 mois",
  plus_tard: "Plus tard",
  indisponible: "Indisponible",
};

export type PipelineStatus =
  | "profil_incomplet" | "en_evaluation" | "pret_preselection" | "preselectionne" | "proposition_envoyee"
  | "candidature_transmise" | "entretien_programme" | "attente_decision" | "stage_obtenu" | "emploi_obtenu"
  | "candidature_refusee" | "candidature_retiree" | "suivi_post_placement";
export const PIPELINE_STATUSES: PipelineStatus[] = [
  "profil_incomplet", "en_evaluation", "pret_preselection", "preselectionne", "proposition_envoyee",
  "candidature_transmise", "entretien_programme", "attente_decision", "stage_obtenu", "emploi_obtenu",
  "candidature_refusee", "candidature_retiree", "suivi_post_placement",
];
export const pipelineLabel: Record<PipelineStatus, string> = {
  profil_incomplet: "Profil incomplet",
  en_evaluation: "En cours d'entretien",
  pret_preselection: "Prêt pour la présélection",
  preselectionne: "Présélectionné",
  proposition_envoyee: "Proposition envoyée au partenaire",
  candidature_transmise: "Candidature transmise",
  entretien_programme: "Entretien de recrutement programmé",
  attente_decision: "En attente de décision",
  stage_obtenu: "Stage obtenu",
  emploi_obtenu: "Emploi obtenu",
  candidature_refusee: "Candidature refusée",
  candidature_retiree: "Candidature retirée",
  suivi_post_placement: "Suivi après placement",
};

export type ApplicationStatus =
  | "soumise" | "en_revue" | "preselectionnee" | "proposee_partenaire" | "entretien_programme"
  | "attente_decision" | "acceptee" | "refusee" | "retiree";
export const APPLICATION_STATUSES: ApplicationStatus[] = [
  "soumise", "en_revue", "preselectionnee", "proposee_partenaire", "entretien_programme", "attente_decision", "acceptee", "refusee", "retiree",
];
export const applicationStatusLabel: Record<ApplicationStatus, string> = {
  soumise: "Soumise",
  en_revue: "En revue par YEN",
  preselectionnee: "Présélectionnée",
  proposee_partenaire: "Proposée au partenaire",
  entretien_programme: "Entretien de recrutement programmé",
  attente_decision: "En attente de décision",
  acceptee: "Acceptée",
  refusee: "Refusée",
  retiree: "Retirée",
};
export const ACTIVE_APPLICATION_STATUSES: ApplicationStatus[] = [
  "soumise", "en_revue", "preselectionnee", "proposee_partenaire", "entretien_programme", "attente_decision",
];

export type OfferStatus = "brouillon" | "en_validation" | "publiee" | "pourvue" | "fermee" | "archivee";
export const OFFER_STATUSES: OfferStatus[] = ["brouillon", "en_validation", "publiee", "pourvue", "fermee", "archivee"];
export const offerStatusLabel: Record<OfferStatus, string> = {
  brouillon: "Brouillon",
  en_validation: "En validation",
  publiee: "Publiée",
  pourvue: "Pourvue",
  fermee: "Fermée",
  archivee: "Archivée",
};

export const organizationStatusLabel: Record<string, string> = {
  en_attente: "En attente",
  actif: "Actif",
  suspendu: "Suspendu",
  inactif: "Inactif",
};

export const importanceLabel = { obligatoire: "Obligatoire", importante: "Importante", souhaitee: "Souhaitée" } as const;

export const questionTypeLabel = {
  choix_unique: "Choix unique",
  choix_multiple: "Choix multiple",
  reponse_courte: "Réponse courte",
  reponse_longue: "Réponse longue",
  etude_de_cas: "Étude de cas",
  exercice_pratique: "Exercice pratique",
} as const;
export type QuestionType = keyof typeof questionTypeLabel;

export const attemptStatusLabel = {
  en_cours: "En cours",
  en_correction: "En correction",
  corrige: "Corrigé",
  annule: "Annulé",
  expire: "Expiré",
} as const;

export const skillSourceLabel = {
  questionnaire: "Questionnaire",
  exercice: "Exercice pratique",
  projet: "Projet vérifié",
  evaluateur: "Évaluateur YEN",
  retour_partenaire: "Retour d'un partenaire",
} as const;

export const confidenceLabel = { faible: "Faible", moyenne: "Moyenne", elevee: "Élevée" } as const;

export const roleLabel = {
  super_admin: "Administrateur principal",
  insertion_manager: "Responsable d'insertion",
  evaluator: "Évaluateur",
  partner_manager: "Gestionnaire de partenaires",
  candidate: "Candidat",
  partner: "Partenaire / recruteur",
} as const;
export type AppRole = keyof typeof roleLabel;
export const STAFF_ROLES: AppRole[] = ["super_admin", "insertion_manager", "evaluator", "partner_manager"];

export const consentLabel = {
  conditions_utilisation: {
    title: "Conditions d'utilisation et politique de confidentialité",
    description: "Obligatoire pour utiliser la plateforme.",
  },
  traitement_ia: {
    title: "Analyse de mon profil par l'intelligence artificielle",
    description: "Autorise l'envoi de votre CV, de votre profil et de vos réponses écrites au fournisseur d'IA de YEN (Anthropic, traitement hors de Guinée) pour extraire vos informations, proposer des recommandations, répondre à l'assistant et aider l'équipe YEN dans ses analyses. Les résultats restent des suggestions vérifiées par des personnes.",
  },
  visibilite_vivier: {
    title: "Visibilité dans le vivier de talents YEN",
    description: "Autorise les responsables d'insertion YEN à vous proposer pour des offres correspondant à votre profil.",
  },
  partage_partenaires: {
    title: "Partage de mon profil avec des partenaires sélectionnés",
    description: "Autorise YEN à partager votre profil professionnel (sans e-mail ni téléphone) avec une organisation partenaire précise. Vous pouvez retirer ce consentement à tout moment.",
  },
  notifications_externes: {
    title: "Notifications par e-mail, SMS ou WhatsApp",
    description: "Uniquement lorsque ces canaux auront été configurés par YEN.",
  },
} as const;
export type ConsentType = keyof typeof consentLabel;
export const CONSENT_TYPES = Object.keys(consentLabel) as ConsentType[];

export const placementContractLabel = {
  stage: "Stage", cdd: "CDD", cdi: "CDI", alternance: "Alternance", mission: "Mission", autre: "Autre",
} as const;

export const experienceTypeLabel = {
  stage: "Stage", emploi: "Emploi", alternance: "Alternance", mission: "Mission", benevolat: "Bénévolat", projet_academique: "Projet académique",
} as const;
