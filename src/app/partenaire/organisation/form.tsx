"use client";

import { z } from "@/lib/zod";
import { EntityForm } from "@/components/forms/entity-form";
import { partnerUpdateOrganizationAction } from "@/features/admin/actions";

type Opt = { value: string; label: string };

export function PartnerOrgForm({ defaults, domains }: { defaults: Record<string, unknown>; domains: Opt[] }) {
  return (
    <EntityForm schema={z.object({ name: z.string().trim().min(2) }).passthrough()} defaultValues={defaults} action={partnerUpdateOrganizationAction}
      fields={[
        { name: "name", label: "Nom de l'organisation", required: true }, { name: "sector", label: "Secteur d'activité" },
        { name: "description", label: "Description", type: "textarea", rows: 4 },
        { name: "city", label: "Ville" }, { name: "country", label: "Pays" }, { name: "website", label: "Site web", type: "url" },
        { name: "email", label: "E-mail professionnel", type: "email" }, { name: "phone", label: "Téléphone" },
        { name: "contact_name", label: "Contact autorisé" }, { name: "contact_email", label: "E-mail du contact", type: "email" }, { name: "contact_phone", label: "Téléphone du contact" },
        { name: "domain_ids", label: "Domaines de recrutement", type: "checkboxes", options: domains },
      ]} />
  );
}
