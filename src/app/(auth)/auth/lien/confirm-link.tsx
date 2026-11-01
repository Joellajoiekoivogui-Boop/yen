"use client";

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { Alert, Button, ButtonLink } from "@/components/ui";
import { confirmEmailLinkAction } from "@/features/auth/actions";

/** Bouton « Continuer » : vérifie le lien (Supabase Auth) et ouvre la session. */
export function ConfirmLink({ tokenHash }: { tokenHash: string }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const confirm = () =>
    start(async () => {
      setError(null);
      const r = await confirmEmailLinkAction({ token_hash: tokenHash });
      if (r.ok) {
        window.location.assign(r.data?.redirectTo ?? "/");
        return;
      }
      setError(r.error);
    });

  if (error)
    return (
      <div className="space-y-4">
        <Alert tone="error">{error}</Alert>
        <ButtonLink href="/connexion" variant="outline" className="w-full">
          Recevoir un nouveau lien
        </ButtonLink>
      </div>
    );

  return (
    <Button variant="secondary" size="lg" className="w-full" onClick={confirm} disabled={pending} aria-busy={pending || undefined}>
      {pending && <Loader2 className="size-4 animate-spin" aria-hidden />}
      Continuer
    </Button>
  );
}
