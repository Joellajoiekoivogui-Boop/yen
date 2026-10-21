"use client";

import Link from "next/link";
import { useState } from "react";
import { EntityForm } from "@/components/forms/entity-form";
import { signInAction } from "@/features/auth/actions";
import { EMAIL_NOT_CONFIRMED_MESSAGE } from "@/features/auth/errors";
import { signInSchema } from "@/features/auth/schemas";
import { ResendConfirmation } from "../resend-confirmation";

export function SignInForm({ next }: { next?: string }) {
  // adresse en attente de confirmation : proposer le renvoi de l'e-mail
  const [unconfirmed, setUnconfirmed] = useState<string | null>(null);
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
          setUnconfirmed(!r.ok && r.error === EMAIL_NOT_CONFIRMED_MESSAGE ? String(v.email ?? "") : null);
          return r;
        }}
        onSuccess={(r) => {
          const to = (r.ok && (r.data as { redirectTo?: string } | undefined)?.redirectTo) || "/";
          window.location.assign(to);
        }}
        footer={<Link href="/mot-de-passe-oublie" className="mx-auto text-sm font-medium text-electric-700 hover:underline">Mot de passe oublié ?</Link>}
      />
      {unconfirmed && <ResendConfirmation email={unconfirmed} />}
    </>
  );
}
