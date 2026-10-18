"use client";

import { EntityForm } from "@/components/forms/entity-form";
import { updatePasswordAction } from "@/features/auth/actions";
import { newPasswordSchema } from "@/features/auth/schemas";

export function ResetForm() {
  return (
    <EntityForm
      schema={newPasswordSchema}
      submitLabel="Enregistrer le nouveau mot de passe"
      fields={[
        { name: "password", label: "Nouveau mot de passe", type: "password", required: true, autoComplete: "new-password", colSpan: 2, help: "10 caractères minimum, avec majuscule, minuscule et chiffre." },
        { name: "password_confirm", label: "Confirmer", type: "password", required: true, autoComplete: "new-password", colSpan: 2 },
      ]}
      action={updatePasswordAction}
      onSuccess={(r) => {
        const to = (r.ok && (r.data as { redirectTo?: string } | undefined)?.redirectTo) || "/";
        setTimeout(() => window.location.assign(to), 1200);
      }}
    />
  );
}
