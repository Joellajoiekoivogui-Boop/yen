"use client";

import { EntityForm } from "@/components/forms/entity-form";
import { Card } from "@/components/ui";
import { requestPasswordResetAction } from "@/features/auth/actions";
import { resetRequestSchema } from "@/features/auth/schemas";

export default function ForgotPasswordPage() {
  return (
    <Card className="w-full max-w-md p-6 sm:p-8">
      <h1 className="text-2xl font-bold text-navy-900">Mot de passe oublié</h1>
      <p className="mt-1 mb-6 text-sm text-muted">Saisissez votre adresse e-mail : vous recevrez un lien sécurisé et temporaire.</p>
      <EntityForm
        schema={resetRequestSchema}
        submitLabel="Envoyer le lien"
        resetOnSuccess
        fields={[{ name: "email", label: "Adresse e-mail", type: "email", required: true, autoComplete: "email", colSpan: 2 }]}
        action={requestPasswordResetAction}
      />
    </Card>
  );
}
