"use client";

import Link from "next/link";
import { useState } from "react";
import { EntityForm } from "@/components/forms/entity-form";
import { ButtonLink } from "@/components/ui";
import { signInAction } from "@/features/auth/actions";
import { EMAIL_NOT_CONFIRMED_MESSAGE } from "@/features/auth/errors";
import { signInSchema } from "@/features/auth/schemas";

export function SignInForm({ next }: { next?: string }) {
  // adresse pas encore vérifiée : mener à la saisie du code (l'adresse est retenue côté serveur)
  const [unconfirmed, setUnconfirmed] = useState(false);
  return (
    <>
      <EntityForm
        schema={signInSchema}
        submitLabel="Se connecter"
        stacked
        fields={[
          { name: "email", label: "Adresse e-mail", type: "email", autoComplete: "username", required: true, colSpan: 2 },
          { name: "password", label: "Mot de passe", type: "password", autoComplete: "current-password", required: true, colSpan: 2 },
        ]}
        action={async (v) => {
          const r = await signInAction({ ...v, next });
          setUnconfirmed(!r.ok && r.error === EMAIL_NOT_CONFIRMED_MESSAGE);
          return r;
        }}
        onSuccess={(r) => {
          const to = (r.ok && (r.data as { redirectTo?: string } | undefined)?.redirectTo) || "/";
          window.location.assign(to);
        }}
        footer={<Link href="/mot-de-passe-oublie" className="mx-auto text-sm font-medium text-electric-700 hover:underline">Mot de passe oublié ?</Link>}
      />
      {unconfirmed && (
        <ButtonLink href="/verification" variant="outline" className="mt-3 w-full animate-slide-down">
          Saisir mon code de vérification
        </ButtonLink>
      )}
    </>
  );
}
