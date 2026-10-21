"use client";

import { useState } from "react";
import { z } from "@/lib/zod";
import { EntityForm } from "@/components/forms/entity-form";
import { Button } from "@/components/ui";
import { saveDomainAction, saveOccupationAction, saveSkillAction } from "@/features/admin/actions";
import { levelLabel } from "@/lib/labels";

type Opt = { value: string; label: string };
const loose = z.object({}).passthrough();

export function DomainForm({ defaults }: { defaults?: Record<string, unknown> }) {
  return (
    <EntityForm schema={loose} defaultValues={{ icon: "cpu", position: 100, is_active: true, ...defaults }} action={(v) => saveDomainAction({ ...v, id: defaults?.id })}
      fields={[
        { name: "name", label: "Nom", required: true }, { name: "slug", label: "Identifiant (slug)", required: true },
        { name: "short_description", label: "Description courte", colSpan: 2 }, { name: "description", label: "Description", type: "textarea", rows: 3 },
        { name: "tools", label: "Outils et technologies (un par ligne)", type: "textarea", rows: 3 }, { name: "certifications", label: "Certifications pertinentes (une par ligne)", type: "textarea", rows: 3 },
        { name: "project_types", label: "Types de projets démonstratifs (un par ligne)", type: "textarea", rows: 3 }, { name: "progression_criteria", label: "Critères de progression", type: "textarea", rows: 2 },
        { name: "icon", label: "Icône" }, { name: "position", label: "Ordre", type: "number" }, { name: "is_active", label: "Actif", type: "checkbox" },
      ]} />
  );
}

export function SkillForm({ defaults, domains }: { defaults?: Record<string, unknown>; domains: Opt[] }) {
  return (
    <EntityForm schema={loose} defaultValues={{ category: "technique", tier: "fondamentale", is_active: true, ...defaults }} action={(v) => saveSkillAction({ ...v, id: defaults?.id })}
      fields={[
        { name: "name", label: "Nom", required: true }, { name: "slug", label: "Identifiant (slug)", required: true },
        { name: "domain_id", label: "Domaine (vide = transversale)", type: "select", options: domains },
        { name: "category", label: "Catégorie", type: "select", options: [{ value: "technique", label: "Technique" }, { value: "transversale", label: "Transversale" }, { value: "outil", label: "Outil" }] },
        { name: "tier", label: "Niveau du référentiel", type: "select", options: [{ value: "fondamentale", label: "Fondamentale" }, { value: "avancee", label: "Avancée" }] },
        { name: "aliases", label: "Synonymes pour la normalisation (séparés par des virgules)" },
        ...(["debutant", "intermediaire", "avance", "expert"] as const).map((l) => ({ name: `crit_${l}`, label: `Critère observable — ${levelLabel[l]}`, type: "textarea" as const, rows: 2, required: true })),
        { name: "is_active", label: "Active", type: "checkbox" },
      ]} />
  );
}

export function OccupationForm({ defaults, domains, skills }: { defaults?: Record<string, unknown> & { skills?: { skill_id: string; required_level: string; importance: string }[] }; domains: Opt[]; skills: Opt[] }) {
  const [rows, setRows] = useState(defaults?.skills ?? []);
  return (
    <div className="space-y-3">
      <div className="space-y-2 rounded-lg border border-border p-3">
        <p className="text-sm font-semibold">Compétences attendues</p>
        {rows.map((r, i) => (
          <div key={i} className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_150px_150px_auto]">
            <select className="field-input" value={r.skill_id} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, skill_id: e.target.value } : x)))} aria-label="Compétence"><option value="">—</option>{skills.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}</select>
            <select className="field-input" value={r.required_level} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, required_level: e.target.value } : x)))} aria-label="Niveau">{Object.entries(levelLabel).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
            <select className="field-input" value={r.importance} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, importance: e.target.value } : x)))} aria-label="Importance"><option value="obligatoire">Obligatoire</option><option value="importante">Importante</option><option value="souhaitee">Souhaitée</option></select>
            <Button variant="ghost" size="sm" onClick={() => setRows(rows.filter((_, j) => j !== i))}>Retirer</Button>
          </div>
        ))}
        <Button variant="outline" size="sm" onClick={() => setRows([...rows, { skill_id: "", required_level: "intermediaire", importance: "importante" }])}>Ajouter une compétence</Button>
      </div>
      <EntityForm schema={loose} defaultValues={{ is_active: true, ...defaults }} action={(v) => saveOccupationAction({ ...v, id: defaults?.id, skills: rows.filter((r) => r.skill_id) })}
        fields={[
          { name: "title", label: "Intitulé", required: true }, { name: "slug", label: "Identifiant (slug)", required: true },
          { name: "domain_id", label: "Domaine", type: "select", options: domains, required: true }, { name: "typical_education", label: "Formation habituelle" },
          { name: "description", label: "Description", type: "textarea", rows: 2 },
          { name: "w_demonstrated_skills", label: "Poids : compétences démontrées", type: "number" }, { name: "w_assessments", label: "Poids : évaluations", type: "number" },
          { name: "w_projects", label: "Poids : projets", type: "number" }, { name: "w_education", label: "Poids : formation", type: "number" }, { name: "w_experience", label: "Poids : expérience", type: "number", help: "Laissez les 5 poids vides pour utiliser la pondération de la plateforme." },
          { name: "is_active", label: "Actif", type: "checkbox" },
        ]} />
    </div>
  );
}
