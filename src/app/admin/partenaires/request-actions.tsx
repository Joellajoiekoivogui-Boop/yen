import { ActionButton } from "@/components/forms/action-button";
import { decidePartnerRequestAction } from "@/features/admin/actions";

/** Accepter ou refuser une demande partenaire en un clic (liste et fiche de l'organisation). */
export function PartnerRequestActions({ organizationId, name }: { organizationId: string; name: string }) {
  return (
    <div className="flex flex-wrap items-start gap-2">
      <ActionButton variant="secondary" action={decidePartnerRequestAction.bind(null, { organizationId, decision: "accepter" })}>
        Accepter
      </ActionButton>
      <ActionButton
        variant="ghost"
        confirm={`Refuser la demande de ${name} ? Le recruteur en sera informé.`}
        action={decidePartnerRequestAction.bind(null, { organizationId, decision: "refuser" })}
      >
        Refuser
      </ActionButton>
    </div>
  );
}
