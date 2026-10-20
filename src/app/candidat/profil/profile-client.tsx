"use client";

import { CrudSection, type CrudItem } from "@/components/forms/crud-section";
import { EntityForm } from "@/components/forms/entity-form";
import {
  deleteEducationAction, deleteExperienceAction, deleteLanguageAction, saveEducationAction, saveExperienceAction, saveLanguageAction, updateProfileAction,
} from "@/features/candidates/actions";
import { educationSchema, experienceSchema, languageSchema, profileSchema } from "@/features/candidates/schemas";
import { availabilityLabel, candidateStatusLabel, experienceTypeLabel, opportunityLabel } from "@/lib/labels";

const opts = (rec: Record<string, string>) => Object.entries(rec).map(([value, label]) => ({ value, label }));


export function ProfileForm({ defaults, domains }: { defaults: Record<string, unknown>; domains: { id: string; name: string }[] }) {
  return (
    <EntityForm
      schema={profileSchema}
      defaultValues={defaults}
      action={updateProfileAction}
      fields={[
        { name: "first_name", label: "Prénom", required: true },
        { name: "last_name", label: "Nom", required: true },
        { name: "phone", label: "Téléphone", type: "tel", required: true, autoComplete: "tel", placeholder: "+224 620 00 00 00", help: "Obligatoire : l'équipe YEN vous appelle pour les opportunités. Il n'est jamais transmis aux partenaires." },
        { name: "city", label: "Ville", required: true, autoComplete: "address-level2" },
        { name: "country", label: "Pays", required: true, autoComplete: "country-name" },
        { name: "status", label: "Statut", type: "select", required: true, options: opts(candidateStatusLabel) },
        { name: "institution", label: "Établissement de formation" },
        { name: "yen_program", label: "Formation suivie chez YEN" },
        { name: "education_level", label: "Niveau d'études", placeholder: "Licence, BTS, Master…" },
        { name: "graduation_year", label: "Année de formation ou de diplomation", type: "number", min: 1970, max: 2100 },
        { name: "primary_domain_id", label: "Domaine principal", type: "select", options: domains.map((d) => ({ value: d.id, label: d.name })) },
        { name: "availability", label: "Disponibilité", type: "select", required: true, options: opts(availabilityLabel) },
        { name: "interest_area", label: "Domaine d'intérêt professionnel", colSpan: 2 },
        { name: "opportunity_types", label: "Opportunités recherchées", type: "checkboxes", options: opts(opportunityLabel) },
        { name: "headline", label: "Titre professionnel", placeholder: "Ex. Technicienne réseaux junior", colSpan: 2 },
        { name: "summary", label: "Résumé professionnel", type: "textarea", rows: 5, help: "Présentez vos compétences et votre projet, en restant factuel (80 caractères minimum pour compléter le profil)." },
        { name: "linkedin_url", label: "Profil LinkedIn", type: "url" },
        { name: "github_url", label: "GitHub / dépôt de code", type: "url" },
        { name: "portfolio_url", label: "Portfolio", type: "url", colSpan: 2 },
      ]}
    />
  );
}

export function EducationList({ items }: { items: CrudItem[] }) {
  return (
    <CrudSection
      items={items}
      schema={educationSchema}
      save={saveEducationAction}
      remove={deleteEducationAction}
      addLabel="Ajouter une formation"
      emptyTitle="Aucune formation renseignée"
      defaults={{ is_yen_program: false }}
      fields={[
        { name: "degree", label: "Diplôme ou formation", required: true },
        { name: "institution", label: "Établissement", required: true },
        { name: "field_of_study", label: "Spécialité" },
        { name: "start_year", label: "Année de début", type: "number", min: 1970, max: 2100 },
        { name: "end_year", label: "Année de fin", type: "number", min: 1970, max: 2100 },
        { name: "is_yen_program", label: "Formation suivie avec YEN", type: "checkbox" },
        { name: "description", label: "Description", type: "textarea", rows: 3 },
      ]}
    />
  );
}

export function ExperienceList({ items, domains }: { items: CrudItem[]; domains: { id: string; name: string }[] }) {
  return (
    <CrudSection
      items={items}
      schema={experienceSchema}
      save={saveExperienceAction}
      remove={deleteExperienceAction}
      addLabel="Ajouter une expérience"
      emptyTitle="Aucune expérience renseignée"
      emptyDescription="Stages, emplois, missions, bénévolat ou projets académiques."
      defaults={{ experience_type: "stage", is_current: false }}
      fields={[
        { name: "title", label: "Intitulé du poste", required: true },
        { name: "organization", label: "Organisation", required: true },
        { name: "experience_type", label: "Type", type: "select", required: true, options: opts(experienceTypeLabel) },
        { name: "city", label: "Ville" },
        { name: "start_date", label: "Date de début", type: "date", required: true },
        { name: "end_date", label: "Date de fin", type: "date" },
        { name: "is_current", label: "Poste actuel", type: "checkbox" },
        { name: "domain_id", label: "Domaine", type: "select", options: domains.map((d) => ({ value: d.id, label: d.name })) },
        { name: "description", label: "Missions", type: "textarea", rows: 3 },
        { name: "achievements", label: "Réalisations mesurables (faits réels uniquement)", type: "textarea", rows: 3 },
      ]}
    />
  );
}

export function LanguageList({ items }: { items: CrudItem[] }) {
  return (
    <CrudSection
      items={items}
      schema={languageSchema}
      save={saveLanguageAction}
      remove={deleteLanguageAction}
      addLabel="Ajouter une langue"
      emptyTitle="Aucune langue renseignée"
      defaults={{ proficiency: "courant" }}
      fields={[
        { name: "language", label: "Langue", required: true },
        { name: "proficiency", label: "Niveau", type: "select", required: true, options: opts({ notions: "Notions", intermediaire: "Intermédiaire", courant: "Courant", natif: "Langue maternelle" }) },
      ]}
    />
  );
}
