"use client";

import { EntityForm } from "@/components/forms/entity-form";
import { saveContactDetailsAction } from "@/features/auth/actions";
import { contactDetailsSchema } from "@/features/auth/schemas";

export function ContactDetailsForm({
  defaultValues,
  staff,
}: {
  defaultValues: { first_name: string; last_name: string; phone: string; city: string; country: string };
  staff: boolean;
}) {
  return (
    <EntityForm
      schema={contactDetailsSchema}
      defaultValues={defaultValues}
      submitLabel={staff ? "Accéder à l'administration" : "Accéder à mon espace"}
      stacked
      action={saveContactDetailsAction}
      onSuccess={(r) => {
        // rechargement complet : l'espace se construit avec les coordonnées enregistrées
        const to = r.ok ? (r.data as { redirectTo?: string } | undefined)?.redirectTo : undefined;
        if (to) window.location.assign(to);
      }}
      fields={[
        { name: "first_name", label: "Prénom", required: true, autoComplete: "given-name" },
        { name: "last_name", label: "Nom", required: true, autoComplete: "family-name" },
        {
          name: "phone",
          label: "Téléphone",
          type: "tel",
          required: true,
          autoComplete: "tel",
          placeholder: "+224 620 00 00 00",
          help: staff ? "Pour que l'équipe YEN puisse vous joindre." : "L'équipe YEN vous appelle pour les opportunités.",
        },
        { name: "city", label: "Ville", required: true, autoComplete: "address-level2" },
        { name: "country", label: "Pays", required: true, autoComplete: "country-name", colSpan: 2 },
      ]}
    />
  );
}
