"use client";

import { z } from "@/lib/zod";
import { EntityForm } from "@/components/forms/entity-form";
import { addInternalNoteAction, requestInfoAction, updateCandidateFollowUpAction } from "@/features/admin/actions";
import { associateCandidateAction, scheduleInterviewAction, shareProfileAction, updateApplicationStatusAction } from "@/features/applications/actions";
import { addSkillEvidenceAction, verifyProjectAction } from "@/features/assessments/actions";
import { reviewAnalysisAction } from "@/features/ai/actions";
import { applicationStatusLabel, APPLICATION_STATUSES, levelLabel, pipelineLabel, PIPELINE_STATUSES } from "@/lib/labels";

type Opt = { value: string; label: string };
const levels = Object.entries(levelLabel).map(([value, label]) => ({ value, label }));

export function NoteForm({ candidateId }: { candidateId: string }) {
  return (
    <EntityForm
      schema={z.object({ note_type: z.enum(["note", "decision", "entretien", "verification"]), body: z.string().trim().min(2, "Note vide.").max(5000) })}
      defaultValues={{ note_type: "note" }}
      resetOnSuccess
      submitLabel="Ajouter la note"
      action={(v) => addInternalNoteAction({ ...v, candidateId })}
      fields={[
        { name: "note_type", label: "Type", type: "select", options: [{ value: "note", label: "Note" }, { value: "decision", label: "Décision" }, { value: "entretien", label: "Entretien" }, { value: "verification", label: "Vérification" }] },
        { name: "body", label: "Note interne (jamais visible par le candidat ou un partenaire)", type: "textarea", rows: 3, required: true },
      ]}
    />
  );
}

export function FollowUpForm({ candidateId, defaults, managers }: { candidateId: string; defaults: Record<string, unknown>; managers: Opt[] }) {
  return (
    <EntityForm
      schema={z.object({ pipeline_status: z.string(), review_flag: z.boolean().optional(), review_flag_reason: z.string().max(1000).nullable().optional(), assigned_manager_id: z.string().nullable().optional(), reason: z.string().max(2000).optional() })}
      defaultValues={defaults}
      submitLabel="Mettre à jour le suivi"
      action={(v) => updateCandidateFollowUpAction({ ...v, candidateId })}
      fields={[
        { name: "pipeline_status", label: "Statut de suivi", type: "select", options: PIPELINE_STATUSES.map((s) => ({ value: s, label: pipelineLabel[s] })) },
        { name: "assigned_manager_id", label: "Responsable de suivi", type: "select", options: managers },
        { name: "reason", label: "Motif du changement de statut", colSpan: 2 },
        { name: "review_flag", label: "Marquer le profil comme « à vérifier »", type: "checkbox", colSpan: 2 },
        { name: "review_flag_reason", label: "Motif de la vérification", colSpan: 2 },
      ]}
    />
  );
}

export function InfoRequestForm({ candidateId }: { candidateId: string }) {
  return (
    <EntityForm
      schema={z.object({ message: z.string().trim().min(10, "Message trop court.").max(2000) })}
      resetOnSuccess
      submitLabel="Envoyer la demande"
      action={(v) => requestInfoAction({ ...v, candidateId })}
      fields={[{ name: "message", label: "Informations demandées au candidat", type: "textarea", rows: 3, required: true }]}
    />
  );
}

export function AssociateForm({ candidateId, offers }: { candidateId: string; offers: Opt[] }) {
  return (
    <EntityForm
      schema={z.object({ offerId: z.guid({ error: "Choisissez une offre." }), note: z.string().max(1000).optional() })}
      resetOnSuccess
      submitLabel="Présélectionner pour l'offre"
      action={(v) => associateCandidateAction({ ...v, candidateId })}
      fields={[
        { name: "offerId", label: "Offre publiée", type: "select", options: offers, required: true, colSpan: 2 },
        { name: "note", label: "Motif de la présélection", colSpan: 2 },
      ]}
    />
  );
}

export function ShareForm({ candidateId, organizations, offers, consent }: { candidateId: string; organizations: Opt[]; offers: Opt[]; consent: boolean }) {
  if (!consent) return <p className="text-sm text-amber-800">Le candidat n&apos;a pas consenti au partage de son profil avec les partenaires : le partage est impossible (contrôle appliqué par la base de données).</p>;
  return (
    <EntityForm
      schema={z.object({ organization_id: z.guid({ error: "Organisation requise." }), offer_id: z.string().nullable().optional(), reason: z.string().trim().min(10, "Motif requis.").max(1000), include_cv: z.boolean(), expires_in_days: z.number().int().min(1).max(365) })}
      defaultValues={{ include_cv: true, expires_in_days: 90 }}
      resetOnSuccess
      submitLabel="Partager le profil"
      action={(v) => shareProfileAction({ ...v, candidateId })}
      fields={[
        { name: "organization_id", label: "Organisation partenaire", type: "select", options: organizations, required: true },
        { name: "offer_id", label: "Offre concernée (facultatif)", type: "select", options: offers },
        { name: "reason", label: "Motif du partage", colSpan: 2, required: true },
        { name: "expires_in_days", label: "Durée d'accès (jours)", type: "number", min: 1, max: 365 },
        { name: "include_cv", label: "Inclure le CV", type: "checkbox" },
      ]}
    />
  );
}

export function ApplicationStatusForm({ applicationId, current }: { applicationId: string; current: string }) {
  return (
    <EntityForm
      schema={z.object({ status: z.string(), reason: z.string().max(2000).optional(), internal: z.boolean().optional() })}
      defaultValues={{ status: current, internal: false }}
      submitLabel="Enregistrer la décision"
      action={(v) => updateApplicationStatusAction({ ...v, applicationId })}
      fields={[
        { name: "status", label: "Nouveau statut", type: "select", options: APPLICATION_STATUSES.map((s) => ({ value: s, label: applicationStatusLabel[s] })) },
        { name: "reason", label: "Motif (obligatoire pour une acceptation ou un refus)" },
        { name: "internal", label: "Étape interne (non affichée au candidat)", type: "checkbox", colSpan: 2 },
      ]}
    />
  );
}

export function InterviewForm({ applicationId }: { applicationId: string }) {
  return (
    <EntityForm
      schema={z.object({ scheduled_at: z.string().min(10, "Date requise."), duration_minutes: z.number().int().min(5).max(600), mode: z.enum(["presentiel", "visio", "telephone"]), location: z.string().max(300).optional(), interviewers: z.string().max(300).optional() })}
      defaultValues={{ duration_minutes: 45, mode: "presentiel" }}
      resetOnSuccess
      submitLabel="Programmer l'entretien"
      action={(v) => scheduleInterviewAction({ ...v, applicationId })}
      fields={[
        { name: "scheduled_at", label: "Date et heure", type: "datetime-local", required: true },
        { name: "duration_minutes", label: "Durée (min)", type: "number", min: 5, max: 600 },
        { name: "mode", label: "Modalité", type: "select", options: [{ value: "presentiel", label: "Présentiel" }, { value: "visio", label: "Visioconférence" }, { value: "telephone", label: "Téléphone" }] },
        { name: "location", label: "Lieu ou lien" },
        { name: "interviewers", label: "Intervenants", colSpan: 2 },
      ]}
    />
  );
}

export function EvidenceForm({ candidateId, skills, projects }: { candidateId: string; skills: Opt[]; projects: Opt[] }) {
  return (
    <EntityForm
      schema={z.object({ skill_id: z.guid({ error: "Choisissez une compétence." }), level: z.string(), source: z.string(), project_id: z.string().nullable().optional(), confidence: z.string(), notes: z.string().trim().min(10, "Décrivez la preuve (10 caractères minimum).").max(2000) })}
      defaultValues={{ level: "intermediaire", source: "evaluateur", confidence: "moyenne" }}
      resetOnSuccess
      submitLabel="Valider la compétence"
      action={(v) => addSkillEvidenceAction({ ...v, candidateId })}
      fields={[
        { name: "skill_id", label: "Compétence", type: "select", options: skills, required: true, colSpan: 2 },
        { name: "level", label: "Niveau observé", type: "select", options: levels },
        { name: "source", label: "Source", type: "select", options: [{ value: "evaluateur", label: "Évaluation par un formateur" }, { value: "exercice", label: "Exercice pratique" }, { value: "projet", label: "Projet" }] },
        { name: "project_id", label: "Projet lié (facultatif)", type: "select", options: projects },
        { name: "confidence", label: "Confiance", type: "select", options: [{ value: "faible", label: "Faible" }, { value: "moyenne", label: "Moyenne" }, { value: "elevee", label: "Élevée" }] },
        { name: "notes", label: "Preuve observée (critères observables)", type: "textarea", rows: 3, required: true },
      ]}
    />
  );
}

export function VerifyProjectForm({ projectId }: { projectId: string }) {
  return (
    <EntityForm
      schema={z.object({ status: z.enum(["verifie", "rejete", "non_verifie"]), note: z.string().max(2000).optional(), level: z.string().nullable().optional() })}
      defaultValues={{ status: "verifie" }}
      submitLabel="Enregistrer la vérification"
      action={(v) => verifyProjectAction({ ...v, projectId })}
      fields={[
        { name: "status", label: "Décision", type: "select", options: [{ value: "verifie", label: "Vérifié" }, { value: "rejete", label: "Non validé" }, { value: "non_verifie", label: "Réinitialiser" }] },
        { name: "level", label: "Niveau démontré pour les compétences liées (facultatif)", type: "select", options: levels },
        { name: "note", label: "Commentaire", colSpan: 2 },
      ]}
    />
  );
}

export function AnalysisReviewForm({ analysisId }: { analysisId: string }) {
  return (
    <EntityForm
      schema={z.object({ validation_status: z.enum(["valide", "corrige", "conteste", "rejete"]), correction_note: z.string().max(3000).optional(), correction: z.string().max(20000).optional() })}
      defaultValues={{ validation_status: "valide" }}
      submitLabel="Enregistrer la revue"
      action={(v) => reviewAnalysisAction({ ...v, analysisId })}
      fields={[
        { name: "validation_status", label: "Revue humaine", type: "select", options: [{ value: "valide", label: "Valider" }, { value: "corrige", label: "Corriger" }, { value: "conteste", label: "Contester" }, { value: "rejete", label: "Rejeter" }] },
        { name: "correction_note", label: "Motif / commentaire" },
        { name: "correction", label: "Correction (texte libre ou JSON)", type: "textarea", rows: 3 },
      ]}
    />
  );
}
