"use client";

import { CrudSection, type CrudItem } from "@/components/forms/crud-section";
import { deleteProjectAction, saveProjectAction } from "@/features/candidates/actions";
import { projectSchema } from "@/features/candidates/schemas";

export function ProjectsList({ items, skills, domains }: { items: CrudItem[]; skills: { id: string; name: string }[]; domains: { id: string; name: string }[] }) {
  return (
    <CrudSection
      items={items}
      schema={projectSchema}
      save={saveProjectAction}
      remove={deleteProjectAction}
      addLabel="Ajouter un projet"
      emptyTitle="Aucun projet documenté"
      emptyDescription="Les projets vérifiés par YEN deviennent des preuves de compétences."
      defaults={{ skill_ids: [] }}
      fields={[
        { name: "title", label: "Titre du projet", required: true },
        { name: "role", label: "Votre rôle" },
        { name: "description", label: "Description (contexte, objectif, ce que vous avez réalisé)", type: "textarea", rows: 4, required: true },
        { name: "outcomes", label: "Résultats obtenus (faits vérifiables)", type: "textarea", rows: 2 },
        { name: "technologies", label: "Technologies et outils (séparés par des virgules)", colSpan: 2 },
        { name: "domain_id", label: "Domaine", type: "select", options: domains.map((d) => ({ value: d.id, label: d.name })) },
        { name: "start_date", label: "Début", type: "date" },
        { name: "end_date", label: "Fin", type: "date" },
        { name: "project_url", label: "Lien de démonstration", type: "url" },
        { name: "repository_url", label: "Dépôt de code / portfolio", type: "url" },
        { name: "skill_ids", label: "Compétences mobilisées", type: "checkboxes", options: skills.map((s) => ({ value: s.id, label: s.name })) },
      ]}
    />
  );
}
