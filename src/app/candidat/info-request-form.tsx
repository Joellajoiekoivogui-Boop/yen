"use client";

import { EntityForm } from "@/components/forms/entity-form";
import { respondInfoRequestAction } from "@/features/candidates/actions";
import { infoResponseSchema } from "@/features/candidates/schemas";

export function InfoRequestForm({ id }: { id: string }) {
  return (
    <EntityForm
      schema={infoResponseSchema}
      defaultValues={{ id }}
      submitLabel="Répondre"
      fields={[{ name: "response", label: "Votre réponse", type: "textarea", rows: 3, required: true }]}
      action={respondInfoRequestAction}
    />
  );
}
