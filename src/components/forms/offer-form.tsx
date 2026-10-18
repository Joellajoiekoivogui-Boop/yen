"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useFieldArray, useForm, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { Alert, Button } from "@/components/ui";
import { offerSchema, type OfferInput } from "@/features/offers/schemas";
import { levelLabel, opportunityLabel } from "@/lib/labels";
import type { ActionResultLike } from "./entity-form";

type Opt = { value: string; label: string };

/** Formulaire d'offre (YEN ou partenaire) avec compétences requises et pondération optionnelle. */
export function OfferForm({
  defaults, organizations, domains, occupations, skills, action, showWeights, redirectBase, lockOrganization,
}: {
  defaults: Partial<OfferInput> & { id?: string };
  organizations: Opt[];
  domains: Opt[];
  occupations: Opt[];
  skills: Opt[];
  action: (v: Record<string, unknown>) => Promise<ActionResultLike>;
  showWeights: boolean;
  redirectBase: string;
  lockOrganization?: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const form = useForm<OfferInput>({
    resolver: zodResolver(offerSchema) as unknown as Resolver<OfferInput>,
    defaultValues: { offer_type: "stage", remote_policy: "sur_site", positions: 1, min_experience_months: 0, skills: [], ...defaults } as OfferInput,
  });
  const { register, control, handleSubmit, formState: { errors } } = form;
  const { fields, append, remove } = useFieldArray({ control, name: "skills" });
  const err = (k: keyof OfferInput) => errors[k]?.message as string | undefined;

  const field = (name: keyof OfferInput, label: string, input: React.ReactNode, span = false) => (
    <div className={span ? "sm:col-span-2" : ""}>
      <label htmlFor={`o-${String(name)}`} className="mb-1 block text-sm font-medium text-navy-900">{label}</label>
      {input}
      {err(name) && <p className="mt-1 text-xs text-red-600">{err(name)}</p>}
    </div>
  );
  const select = (name: keyof OfferInput, options: Opt[], empty = true) => (
    <select id={`o-${String(name)}`} className="field-input" {...register(name, { setValueAs: (v) => (v === "" ? null : v) })}>
      {empty && <option value="">—</option>}
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );

  return (
    <form
      noValidate
      className="space-y-6"
      onSubmit={handleSubmit((v) =>
        start(async () => {
          setStatus(null);
          const r = await action({ ...v, id: defaults.id });
          setStatus({ ok: r.ok, text: r.ok ? (r.message ?? "Enregistré.") : r.error });
          if (r.ok) {
            const newId = (r.data as { id?: string } | undefined)?.id;
            if (!defaults.id && newId) router.push(`${redirectBase}/${newId}`);
            else router.refresh();
          }
        }),
      )}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        {!lockOrganization && field("organization_id", "Organisation", select("organization_id", organizations))}
        {field("title", "Intitulé du poste", <input id="o-title" className="field-input" {...register("title")} />, lockOrganization)}
        {field("offer_type", "Type", select("offer_type", Object.entries(opportunityLabel).map(([value, label]) => ({ value, label })), false))}
        {field("domain_id", "Domaine d'ingénierie", select("domain_id", domains))}
        {field("occupation_id", "Métier de référence (facultatif)", select("occupation_id", occupations))}
        {field("education_level", "Niveau de formation", <input id="o-education_level" className="field-input" placeholder="Ex. Licence, BTS" {...register("education_level")} />)}
        {field("min_experience_months", "Expérience souhaitée (mois)", <input id="o-min_experience_months" type="number" min={0} className="field-input" {...register("min_experience_months", { valueAsNumber: true })} />)}
        {field("location", "Lieu", <input id="o-location" className="field-input" {...register("location")} />)}
        {field("remote_policy", "Modalité", select("remote_policy", [{ value: "sur_site", label: "Sur site" }, { value: "hybride", label: "Hybride" }, { value: "distance", label: "À distance" }], false))}
        {field("deadline", "Date limite", <input id="o-deadline" type="date" className="field-input" {...register("deadline")} />)}
        {field("positions", "Nombre de places", <input id="o-positions" type="number" min={1} className="field-input" {...register("positions", { valueAsNumber: true })} />)}
        {field("description", "Description", <textarea id="o-description" rows={8} className="field-input" {...register("description")} />, true)}
        {field("special_conditions", "Conditions particulières", <textarea id="o-special_conditions" rows={3} className="field-input" {...register("special_conditions")} />, true)}
      </div>

      <fieldset className="rounded-lg border border-border p-4">
        <legend className="px-1 text-sm font-semibold text-navy-900">Compétences obligatoires et souhaitées</legend>
        <div className="space-y-2">
          {fields.map((f, i) => (
            <div key={f.id} className="grid grid-cols-1 items-end gap-2 sm:grid-cols-[1fr_160px_150px_auto]">
              <select aria-label="Compétence" className="field-input" {...register(`skills.${i}.skill_id`)}>
                <option value="">— Compétence —</option>
                {skills.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
              <select aria-label="Niveau requis" className="field-input" {...register(`skills.${i}.required_level`)}>
                {Object.entries(levelLabel).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
              <label className="flex h-10 items-center gap-2 text-sm"><input type="checkbox" className="accent-electric-600" {...register(`skills.${i}.is_mandatory`)} /> Obligatoire</label>
              <Button variant="ghost" size="sm" onClick={() => remove(i)} aria-label="Retirer"><Trash2 className="size-4 text-red-600" aria-hidden /></Button>
            </div>
          ))}
          {errors.skills && <p className="text-xs text-red-600">Vérifiez les compétences (chaque ligne doit avoir une compétence).</p>}
          <Button variant="outline" size="sm" onClick={() => append({ skill_id: "", required_level: "intermediaire", is_mandatory: false })}><Plus className="size-4" aria-hidden /> Ajouter une compétence</Button>
        </div>
      </fieldset>

      {showWeights && (
        <fieldset className="rounded-lg border border-border p-4">
          <legend className="px-1 text-sm font-semibold text-navy-900">Pondération du score de compatibilité (facultatif)</legend>
          <p className="mb-3 text-xs text-muted">Laissez vide pour utiliser la pondération du métier ou de la plateforme. Sinon, renseignez les 5 valeurs (somme = 100).</p>
          <div className="grid gap-3 sm:grid-cols-5">
            {([["w_demonstrated_skills", "Compétences démontrées"], ["w_assessments", "Évaluations"], ["w_projects", "Projets"], ["w_education", "Formation"], ["w_experience", "Expérience"]] as const).map(([k, l]) => (
              <div key={k}>
                <label htmlFor={`o-${k}`} className="mb-1 block text-xs font-medium text-muted">{l}</label>
                <input id={`o-${k}`} type="number" min={0} max={100} className="field-input" {...register(k, { setValueAs: (v) => (v === "" || v == null ? null : Number(v)) })} />
              </div>
            ))}
          </div>
          {err("w_experience") && <p className="mt-1 text-xs text-red-600">{err("w_experience")}</p>}
        </fieldset>
      )}

      {status && <Alert tone={status.ok ? "success" : "error"}>{status.text}</Alert>}
      <Button type="submit" variant="secondary" disabled={pending}>{pending && <Loader2 className="size-4 animate-spin" aria-hidden />} Enregistrer l&apos;offre</Button>
    </form>
  );
}
