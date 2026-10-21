"use client";

import Link from "next/link";
import { EntityForm } from "@/components/forms/entity-form";
import { signInAction } from "@/features/auth/actions";
import { signInSchema } from "@/features/auth/schemas";

export function SignInForm({ next }: { next?: string }) {
  return (
    <EntityForm
      schema={signInSchema}
      submitLabel="Se connecter"
      stacked
      fields={[
        { name: "email", label: "Adresse e-mail", type: "email", autoComplete: "username", required: true, colSpan: 2 },
        { name: "password", label: "Mot de passe", type: "password", autoComplete: "current-password", required: true, colSpan: 2 },
      ]}
      action={(v) => signInAction({ ...v, next })}
      onSuccess={(r) => {
        const to = (r.ok && (r.data as { redirectTo?: string } | undefined)?.redirectTo) || "/";
        window.location.assign(to);
      }}
      footer={<Link href="/mot-de-passe-oublie" className="mx-auto text-sm font-medium text-electric-700 hover:underline">Mot de passe oublié ?</Link>}
    />
  );
}
