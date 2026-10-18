"use client";

import { useState } from "react";
import { z } from "zod";
import { EntityForm } from "@/components/forms/entity-form";
import { Button } from "@/components/ui";
import { partnerFeedbackAction, partnerUpdateApplicationAction, scheduleInterviewAction } from "@/features/applications/actions";
import { levelLabel } from "@/lib/labels";

type Opt = { value: string; label: string };

export function PartnerStatusForm({ applicationId, current }: { applicationId: string; current: string }) {
  return (
    <EntityForm schema={z.object({ status: z.string() }).passthrough()} defaultValues={{ status: ["proposee_partenaire", "entretien_programme", "attente_decision", "acceptee", "refusee"].includes(current) ? current : "proposee_partenaire" }} submitLabel="Mettre à jour"
      action={(v) => partnerUpdateApplicationAction({ ...v, applicationId })}
      fields={[
        { name: "status", label: "Étape du recrutement", type: "select", options: [{ value: "proposee_partenaire", label: "En étude" }, { value: "entretien_programme", label: "Entretien programmé" }, { value: "attente_decision", label: "En attente de décision" }, { value: "acceptee", label: "Retenu(e)" }, { value: "refusee", label: "Non retenu(e)" }] },
        { name: "reason", label: "Motif (obligatoire pour une décision)" },
        { name: "shortlisted", label: "Ajouter à ma présélection", type: "checkbox", colSpan: 2 },
      ]} />
  );
}

export function PartnerInterviewForm({ applicationId }: { applicationId: string }) {
  return (
    <EntityForm schema={z.object({ scheduled_at: z.string().min(10, "Date requise.") }).passthrough()} defaultValues={{ duration_minutes: 45, mode: "presentiel" }} resetOnSuccess submitLabel="Programmer"
      action={(v) => scheduleInterviewAction({ ...v, applicationId })}
      fields={[
        { name: "scheduled_at", label: "Date et heure", type: "datetime-local", required: true },
        { name: "duration_minutes", label: "Durée (min)", type: "number" },
        { name: "mode", label: "Modalité", type: "select", options: [{ value: "presentiel", label: "Présentiel" }, { value: "visio", label: "Visioconférence" }, { value: "telephone", label: "Téléphone" }] },
        { name: "location", label: "Lieu ou lien" },
      ]} />
  );
}

export function PartnerFeedbackForm({ applicationId, skills }: { applicationId: string; skills: Opt[] }) {
  const [ratings, setRatings] = useState<{ skill_id: string; level: string }[]>([]);
  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <p className="text-sm font-medium text-navy-900">Niveau observé par compétence (facultatif)</p>
        {ratings.map((r, i) => (
          <div key={i} className="grid grid-cols-[1fr_140px_auto] gap-2">
            <select className="field-input" value={r.skill_id} onChange={(e) => setRatings(ratings.map((x, j) => (j === i ? { ...x, skill_id: e.target.value } : x)))} aria-label="Compétence"><option value="">—</option>{skills.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}</select>
            <select className="field-input" value={r.level} onChange={(e) => setRatings(ratings.map((x, j) => (j === i ? { ...x, level: e.target.value } : x)))} aria-label="Niveau">{Object.entries(levelLabel).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
            <Button variant="ghost" size="sm" onClick={() => setRatings(ratings.filter((_, j) => j !== i))}>Retirer</Button>
          </div>
        ))}
        <Button variant="outline" size="sm" onClick={() => setRatings([...ratings, { skill_id: "", level: "intermediaire" }])}>Ajouter une compétence</Button>
      </div>
      <EntityForm schema={z.object({ comments: z.string().trim().min(10, "Commentaire trop court.") }).passthrough()} defaultValues={{ context: "entretien" }} resetOnSuccess submitLabel="Envoyer le retour à YEN"
        action={(v) => partnerFeedbackAction({ ...v, applicationId, skill_ratings: ratings.filter((r) => r.skill_id) })}
        fields={[
          { name: "context", label: "Contexte", type: "select", options: [{ value: "entretien", label: "Après entretien" }, { value: "stage", label: "Pendant / après un stage" }, { value: "emploi", label: "En emploi" }] },
          { name: "overall_rating", label: "Appréciation globale (1 à 5)", type: "number", min: 1, max: 5 },
          { name: "comments", label: "Commentaires sur les compétences observées", type: "textarea", rows: 4, required: true },
        ]} />
    </div>
  );
}
