"use client";

import { z } from "@/lib/zod";
import { EntityForm } from "@/components/forms/entity-form";
import { savePlacementAction } from "@/features/admin/actions";

type Opt = { value: string; label: string };

export function PlacementForm({ candidates, organizations, managers, applications, defaults }: { candidates: Opt[]; organizations: Opt[]; managers: Opt[]; applications: Opt[]; defaults?: Record<string, unknown> }) {
  return (
    <EntityForm
      schema={z.object({ candidate_id: z.guid({ error: "Candidat requis." }), organization_name: z.string().trim().min(2, "Organisation requise."), position_title: z.string().trim().min(2, "Poste requis."), start_date: z.string().min(10, "Date requise.") }).passthrough()}
      defaultValues={{ placement_type: "stage", contract_type: "stage", confirmation_status: "declare", ...defaults }}
      resetOnSuccess={!defaults?.id}
      action={(v) => savePlacementAction({ ...v, id: defaults?.id })}
      fields={[
        { name: "candidate_id", label: "Candidat", type: "select", options: candidates, required: true, colSpan: 2 },
        { name: "application_id", label: "Candidature liée (facultatif)", type: "select", options: applications, colSpan: 2 },
        { name: "organization_id", label: "Organisation partenaire (si référencée)", type: "select", options: organizations },
        { name: "organization_name", label: "Organisation d'accueil", required: true },
        { name: "position_title", label: "Poste occupé", required: true },
        { name: "placement_type", label: "Type", type: "select", options: [{ value: "stage", label: "Stage" }, { value: "emploi", label: "Emploi" }] },
        { name: "contract_type", label: "Type de contrat", type: "select", options: [{ value: "stage", label: "Stage" }, { value: "cdd", label: "CDD" }, { value: "cdi", label: "CDI" }, { value: "alternance", label: "Alternance" }, { value: "mission", label: "Mission" }, { value: "autre", label: "Autre" }] },
        { name: "start_date", label: "Date de début", type: "date", required: true },
        { name: "end_date", label: "Date de fin (si connue)", type: "date" },
        { name: "duration_months", label: "Durée (mois, si connue)", type: "number", min: 0 },
        { name: "follow_up_manager_id", label: "Responsable de suivi", type: "select", options: managers },
        { name: "confirmation_status", label: "Statut de confirmation", type: "select", options: [{ value: "declare", label: "Déclaré (non confirmé)" }, { value: "confirme", label: "Confirmé" }, { value: "annule", label: "Annulé" }], help: "Seuls les placements confirmés entrent dans le taux d'insertion." },
        { name: "candidate_feedback", label: "Retour du candidat", type: "textarea", rows: 2 },
        { name: "organization_feedback", label: "Retour de l'organisation", type: "textarea", rows: 2 },
      ]}
    />
  );
}
