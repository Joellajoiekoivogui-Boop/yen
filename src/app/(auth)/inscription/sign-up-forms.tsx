"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { MailCheck } from "lucide-react";
import { EntityForm } from "@/components/forms/entity-form";
import { signUpCandidateAction, signUpPartnerAction } from "@/features/auth/actions";
import { MIN_PASSWORD_LENGTH } from "@/features/auth/password-rules";
import { candidateSignUpSchema, partnerSignUpSchema } from "@/features/auth/schemas";
import { cn } from "@/lib/utils";
import { ResendConfirmation } from "../resend-confirmation";

const PASSWORD_HELP = `${MIN_PASSWORD_LENGTH} caractères minimum. Notez-le bien : c'est lui qui vous servira à vous connecter.`;
const terms = (
  <>
    J&apos;accepte les <Link href="/conditions" target="_blank" className="underline">conditions d&apos;utilisation</Link> et la{" "}
    <Link href="/confidentialite" target="_blank" className="underline">politique de confidentialité</Link>
  </>
);

/** Inscription en une étape : quelques champs seulement, le reste se complète ensuite dans le profil. */
export function SignUpForms({ initialType }: { initialType: "candidat" | "partenaire" }) {
  const [type, setType] = useState(initialType);
  const [done, setDone] = useState<{ message: string; email: string } | null>(null);
  // adresse saisie, pour le renvoi de l'e-mail de confirmation (référence : lue après l'envoi)
  const email = useRef("");

  if (done)
    return (
      <div role="status" className="flex flex-col items-center py-6 text-center">
        <span className="relative grid size-16 place-items-center">
          <span aria-hidden className="absolute inset-0 animate-ping-slow rounded-full bg-emerald-200" />
          <span className="relative grid size-16 animate-pop-in place-items-center rounded-full bg-emerald-50 text-emerald-600 ring-1 ring-emerald-200">
            <MailCheck className="size-7" aria-hidden />
          </span>
        </span>
        <p className="mt-5 font-heading text-lg font-semibold text-navy-900">Vérifiez votre boîte de réception</p>
        <p className="mt-2 max-w-md text-sm leading-relaxed text-muted">{done.message}</p>
        {done.email && <p className="mt-2 text-sm font-medium text-navy-900">{done.email}</p>}
        {done.email && <ResendConfirmation email={done.email} />}
        <Link href="/connexion" className="mt-4 text-sm font-medium text-electric-700 hover:underline">
          J&apos;ai confirmé mon adresse : me connecter
        </Link>
      </div>
    );

  return (
    <div>
      <div className="relative mb-6 grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1" role="tablist" aria-label="Type de compte">
        <span
          aria-hidden
          className={cn(
            "absolute inset-y-1 left-1 w-[calc(50%-0.375rem)] rounded-lg bg-white shadow-md shadow-navy-900/10 transition-transform duration-500 ease-spring",
            type === "partenaire" && "translate-x-[calc(100%+0.25rem)]",
          )}
        />
        {(["candidat", "partenaire"] as const).map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={type === t}
            onClick={() => setType(t)}
            className={cn("relative z-10 rounded-lg px-3 py-2 text-sm font-medium transition-colors duration-300", type === t ? "text-navy-900" : "text-slate-600 hover:text-navy-900")}
          >
            {t === "candidat" ? "Étudiant / diplômé" : "Organisation partenaire"}
          </button>
        ))}
      </div>

      {type === "candidat" ? (
        <EntityForm
          key="candidat"
          schema={candidateSignUpSchema}
          submitLabel="Créer mon compte"
          stacked
          action={(v) => {
            email.current = String(v.email ?? "");
            return signUpCandidateAction(v);
          }}
          onSuccess={(r) => {
            const to = r.ok ? (r.data as { redirectTo?: string } | undefined)?.redirectTo : undefined;
            if (to) window.location.assign(to);
            else if (r.ok) setDone({ message: r.message ?? "Compte créé.", email: email.current });
          }}
          fields={[
            { name: "first_name", label: "Prénom", required: true, autoComplete: "given-name" },
            { name: "last_name", label: "Nom", required: true, autoComplete: "family-name" },
            { name: "phone", label: "Téléphone", type: "tel", required: true, autoComplete: "tel", placeholder: "+224 620 00 00 00", help: "L'équipe YEN vous appelle pour les opportunités." },
            { name: "email", label: "Adresse e-mail", type: "email", required: true, autoComplete: "email" },
            { name: "password", label: "Mot de passe", type: "password", required: true, autoComplete: "new-password", help: PASSWORD_HELP },
            { name: "password_confirm", label: "Retapez le mot de passe", type: "password", required: true, autoComplete: "new-password" },
            { name: "accepted_terms", label: terms, type: "checkbox", required: true, colSpan: 2 },
          ]}
        />
      ) : (
        <EntityForm
          key="partenaire"
          schema={partnerSignUpSchema}
          submitLabel="Demander un espace partenaire"
          stacked
          action={(v) => {
            email.current = String(v.email ?? "");
            return signUpPartnerAction(v);
          }}
          onSuccess={(r) => {
            const to = r.ok ? (r.data as { redirectTo?: string } | undefined)?.redirectTo : undefined;
            if (to) window.location.assign(to);
            else if (r.ok) setDone({ message: r.message ?? "Demande enregistrée.", email: email.current });
          }}
          fields={[
            { name: "organization_name", label: "Nom de l'organisation", required: true, autoComplete: "organization", colSpan: 2 },
            { name: "first_name", label: "Prénom du contact", required: true, autoComplete: "given-name" },
            { name: "last_name", label: "Nom du contact", required: true, autoComplete: "family-name" },
            { name: "email", label: "E-mail professionnel", type: "email", required: true, autoComplete: "email" },
            { name: "phone", label: "Téléphone", type: "tel", autoComplete: "tel" },
            { name: "password", label: "Mot de passe", type: "password", required: true, autoComplete: "new-password", help: PASSWORD_HELP },
            { name: "password_confirm", label: "Retapez le mot de passe", type: "password", required: true, autoComplete: "new-password" },
            { name: "accepted_terms", label: terms, type: "checkbox", required: true, colSpan: 2 },
          ]}
        />
      )}
    </div>
  );
}
