"use client";

import { CrudSection, type CrudItem } from "@/components/forms/crud-section";
import { deleteDeclaredSkillAction, saveDeclaredSkillAction } from "@/features/candidates/actions";
import { declaredSkillSchema } from "@/features/candidates/schemas";
import { levelLabel } from "@/lib/labels";

export function DeclaredSkills({ items, skills }: { items: CrudItem[]; skills: { id: string; name: string; group: string }[] }) {
  return (
    <CrudSection
      items={items}
      schema={declaredSkillSchema}
      save={saveDeclaredSkillAction}
      remove={deleteDeclaredSkillAction}
      addLabel="Déclarer une compétence"
      emptyTitle="Aucune compétence déclarée"
      emptyDescription="Déclarez vos compétences : elles seront ensuite à démontrer par des évaluations ou des projets."
      defaults={{ self_level: "debutant" }}
      fields={[
        { name: "skill_id", label: "Compétence", type: "select", required: true, colSpan: 2, options: skills.map((s) => ({ value: s.id, label: `${s.name} — ${s.group}` })) },
        { name: "self_level", label: "Niveau auto-évalué", type: "select", required: true, options: Object.entries(levelLabel).map(([value, label]) => ({ value, label })) },
        { name: "years_experience", label: "Années de pratique", type: "number", min: 0, max: 60, step: 0.5 },
        { name: "evidence_note", label: "Où l'avez-vous utilisée ?", type: "textarea", rows: 2 },
      ]}
    />
  );
}
