"use client";

import { z } from "zod";
import { useRouter } from "next/navigation";
import { EntityForm } from "@/components/forms/entity-form";
import { addOrganizationEventAction, saveOrganizationAction, setOrganizationStatusAction } from "@/features/admin/actions";

type Opt = { value: string; label: string };
const loose = z.object({ name: z.string().trim().min(2, "Nom requis.") }).passthrough();

export const ORG_FIELDS = (domains: Opt[]) => [
  { name: "name", label: "Nom de l'organisation", required: true },
  { name: "sector", label: "Secteur d'activité" },
  { name: "description", label: "Description", type: "textarea" as const, rows: 3 },
  { name: "city", label: "Ville" }, { name: "country", label: "Pays" },
  { name: "website", label: "Site web", type: "url" as const }, { name: "email", label: "E-mail professionnel", type: "email" as const },
  { name: "phone", label: "Téléphone" }, { name: "contact_name", label: "Contact autorisé" },
  { name: "contact_email", label: "E-mail du contact", type: "email" as const }, { name: "contact_phone", label: "Téléphone du contact" },
  { name: "domain_ids", label: "Domaines de recrutement", type: "checkboxes" as const, options: domains },
];

export function OrganizationForm({ defaults, domains }: { defaults?: Record<string, unknown>; domains: Opt[] }) {
  const router = useRouter();
  return (
    <EntityForm schema={loose} defaultValues={{ country: "Guinée", partnership_type: "recrutement", domain_ids: [], ...defaults }}
      action={async (v) => {
        const r = await saveOrganizationAction({ ...v, id: defaults?.id });
        if (r.ok && !defaults?.id && r.data) router.push(`/admin/partenaires/${r.data.id}`);
        return r;
      }}
      fields={[...ORG_FIELDS(domains), { name: "partnership_type", label: "Type de partenariat", type: "select", options: [{ value: "recrutement", label: "Recrutement" }, { value: "stage", label: "Stages" }, { value: "formation", label: "Formation" }, { value: "institutionnel", label: "Institutionnel" }, { value: "autre", label: "Autre" }] }]} />
  );
}

export function OrganizationStatusForm({ organizationId, defaults }: { organizationId: string; defaults: Record<string, unknown> }) {
  return (
    <EntityForm schema={z.object({ status: z.string() }).passthrough()} defaultValues={defaults} submitLabel="Mettre à jour" action={(v) => setOrganizationStatusAction({ ...v, organizationId })}
      fields={[
        { name: "status", label: "Statut du partenariat", type: "select", options: [{ value: "en_attente", label: "En attente" }, { value: "actif", label: "Actif" }, { value: "suspendu", label: "Suspendu" }, { value: "inactif", label: "Inactif" }] },
        { name: "portal_enabled", label: "Espace partenaire activé", type: "checkbox" },
        { name: "is_public", label: "Publication autorisée sur la page publique « Partenaires »", type: "checkbox", colSpan: 2, help: "Ne cochez que si l'organisation a donné son accord écrit." },
      ]} />
  );
}

export function OrganizationEventForm({ organizationId }: { organizationId: string }) {
  return (
    <EntityForm schema={z.object({ description: z.string().trim().min(3, "Description requise.") }).passthrough()} defaultValues={{ event_type: "reunion", occurred_on: new Date().toISOString().slice(0, 10) }} resetOnSuccess submitLabel="Ajouter à l'historique"
      action={(v) => addOrganizationEventAction({ ...v, organizationId })}
      fields={[
        { name: "event_type", label: "Type", type: "select", options: [{ value: "reunion", label: "Réunion" }, { value: "convention", label: "Convention" }, { value: "recrutement", label: "Recrutement" }, { value: "retour", label: "Retour" }, { value: "autre", label: "Autre" }] },
        { name: "occurred_on", label: "Date", type: "date" },
        { name: "description", label: "Description", type: "textarea", rows: 2, required: true },
      ]} />
  );
}
