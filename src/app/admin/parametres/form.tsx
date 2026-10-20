"use client";

import { z } from "zod";
import { EntityForm } from "@/components/forms/entity-form";
import { saveSettingsAction } from "@/features/admin/actions";

export function SettingsForm({ defaults }: { defaults: Record<string, unknown> }) {
  const w = (n: string, l: string) => ({ name: n, label: l, type: "number" as const, min: 0, max: 100 });
  return (
    <EntityForm schema={z.object({}).passthrough()} defaultValues={defaults} action={saveSettingsAction}
      fields={[
        w("w_demonstrated_skills", "Poids : compétences démontrées"), w("w_assessments", "Poids : résultats des évaluations"), w("w_projects", "Poids : projets et réalisations"),
        w("w_education", "Poids : formation et certifications"), { ...w("w_experience", "Poids : expérience pertinente"), help: "La somme des 5 poids doit être égale à 100." },
        { name: "max_cv_size_mb", label: "Taille maximale d'un CV (Mo, ≤ 10)", type: "number", min: 1, max: 10 },
        { name: "auto_max_level", label: "Niveau maximal attribuable automatiquement par un questionnaire", type: "select", options: [{ value: "debutant", label: "Débutant" }, { value: "intermediaire", label: "Intermédiaire" }, { value: "avance", label: "Avancé" }], help: "Le niveau expert n'est jamais attribué automatiquement." },
        { name: "insertion_window_months", label: "Fenêtre du taux d'insertion de la vue générale (mois)", type: "number", min: 1, max: 36 },
        { name: "partner_requires_validation", label: "Les offres des partenaires doivent être validées par YEN", type: "checkbox" },
      ]} />
  );
}
