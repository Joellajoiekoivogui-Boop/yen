"use client";

import { z } from "zod";
import { EntityForm } from "@/components/forms/entity-form";
import { applyToOfferAction } from "@/features/applications/actions";

const schema = z.object({ motivation: z.string().trim().max(5000).optional() });

export function ApplyForm({ offerId }: { offerId: string }) {
  return (
    <EntityForm
      schema={schema}
      submitLabel="Postuler"
      fields={[{ name: "motivation", label: "Message de motivation (facultatif)", type: "textarea", rows: 5, help: "Restez factuel : vos compétences démontrées et projets parlent pour vous." }]}
      action={(v) => applyToOfferAction({ ...v, offerId })}
    />
  );
}
