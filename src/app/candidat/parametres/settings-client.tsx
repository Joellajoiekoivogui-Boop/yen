"use client";

import { useState, useTransition } from "react";
import { EntityForm } from "@/components/forms/entity-form";
import { Alert, Button } from "@/components/ui";
import { saveConsentsAction, requestAccountDeletionAction } from "@/features/candidates/actions";
import { consentsSchema } from "@/features/candidates/schemas";
import { signOutEverywhereAction, updatePasswordAction } from "@/features/auth/actions";
import { newPasswordSchema } from "@/features/auth/schemas";
import { consentLabel } from "@/lib/labels";

export function ConsentsForm({ defaults }: { defaults: Record<string, boolean> }) {
  const keys = ["traitement_ia", "visibilite_vivier", "partage_partenaires", "notifications_externes"] as const;
  return (
    <EntityForm
      schema={consentsSchema}
      defaultValues={defaults}
      submitLabel="Enregistrer mes préférences"
      action={saveConsentsAction}
      fields={keys.map((k) => ({ name: k, type: "checkbox" as const, colSpan: 2 as const, label: <span><strong>{consentLabel[k].title}</strong><span className="block text-xs text-muted">{consentLabel[k].description}</span></span> }))}
    />
  );
}

export function PasswordForm() {
  return (
    <EntityForm
      schema={newPasswordSchema}
      submitLabel="Changer le mot de passe"
      resetOnSuccess
      action={updatePasswordAction}
      fields={[
        { name: "password", label: "Nouveau mot de passe", type: "password", autoComplete: "new-password", required: true },
        { name: "password_confirm", label: "Confirmer", type: "password", autoComplete: "new-password", required: true },
      ]}
    />
  );
}

export function SecurityActions() {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  return (
    <div className="space-y-4">
      {msg && <Alert tone="info">{msg}</Alert>}
      <Button variant="outline" disabled={pending} onClick={() => start(async () => { const r = await signOutEverywhereAction(); setMsg(r.ok ? r.message ?? "" : r.error); if (r.ok) window.location.assign("/connexion"); })}>
        Fermer toutes mes sessions
      </Button>
      <div className="rounded-lg border border-red-200 bg-red-50/40 p-4">
        <p className="text-sm font-semibold text-red-800">Demander la suppression de mon compte</p>
        <p className="mt-1 text-xs text-red-700">Votre demande est transmise à l&apos;équipe YEN, qui procède à la suppression ou à l&apos;anonymisation de vos données (sous réserve des obligations de conservation).</p>
        <textarea className="field-input mt-2" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Motif (facultatif)" aria-label="Motif de la demande" />
        <Button variant="danger" size="sm" className="mt-2" disabled={pending} onClick={() => { if (window.confirm("Confirmer la demande de suppression ?")) start(async () => { const r = await requestAccountDeletionAction(reason); setMsg(r.ok ? r.message ?? "" : r.error); }); }}>
          Envoyer la demande
        </Button>
      </div>
    </div>
  );
}
