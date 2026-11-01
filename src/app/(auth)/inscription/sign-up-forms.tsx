"use client";

import Link from "next/link";
import { useState } from "react";
import { AuthDivider, GoogleSignInButton } from "@/components/auth/google-sign-in-button";
import { TermsNote } from "@/components/auth/terms-note";
import { EntityForm } from "@/components/forms/entity-form";
import { signUpCandidateAction, signUpPartnerAction, signUpWithEmailAction } from "@/features/auth/actions";
import { MIN_PASSWORD_LENGTH } from "@/features/auth/password-rules";
import { candidateEmailSignUpSchema, candidateSignUpSchema, partnerEmailSignUpSchema, partnerSignUpSchema } from "@/features/auth/schemas";
import { cn } from "@/lib/utils";

const PASSWORD_HELP = `${MIN_PASSWORD_LENGTH} caractères minimum.`;
const terms = (
  <>
    J&apos;accepte les <Link href="/conditions" target="_blank" className="underline">conditions d&apos;utilisation</Link> et la{" "}
    <Link href="/confidentialite" target="_blank" className="underline">politique de confidentialité</Link>
  </>
);

/**
 * Inscription. Par défaut sans mot de passe : Google, ou l'adresse e-mail seule (candidat), puis un
 * lien et un code reçus par e-mail confirment l'adresse. Les coordonnées sont demandées ensuite
 * (page « Vos coordonnées »). Le mot de passe reste possible, en option.
 */
export function SignUpForms({ initialType, google = false }: { initialType: "candidat" | "partenaire"; google?: boolean }) {
  const [type, setType] = useState(initialType);
  const [withPassword, setWithPassword] = useState(false);
  // après l'envoi : page de saisie du code (ou espace, si Supabase ne demande pas de vérification)
  const goTo = (r: { ok: boolean; data?: unknown }) => {
    const to = r.ok ? (r.data as { redirectTo?: string } | undefined)?.redirectTo : undefined;
    if (to) window.location.assign(to);
  };

  return (
    <div>
      <div className="relative mb-6 grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1" role="tablist" aria-label="Type de compte">
        <span
          aria-hidden
          className={cn(
            "absolute inset-y-1 left-1 w-[calc(50%-0.375rem)] rounded-lg bg-white shadow-sm transition-transform duration-300 ease-out",
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

      {type === "candidat" && !withPassword && (
        <div className="space-y-4">
          {google && (
            <>
              <GoogleSignInButton acceptTerms label="S'inscrire avec Google" />
              <AuthDivider />
            </>
          )}
          <EntityForm
            key="candidat-lien"
            schema={candidateEmailSignUpSchema}
            submitLabel="Créer mon compte"
            stacked
            action={(v) => signUpWithEmailAction({ ...v, account_type: "candidate" })}
            onSuccess={goTo}
            fields={[{ name: "email", label: "Adresse e-mail", type: "email", required: true, autoComplete: "email", colSpan: 2 }]}
          />
        </div>
      )}

      {type === "candidat" && withPassword && (
        <EntityForm
          key="candidat-mot-de-passe"
          schema={candidateSignUpSchema}
          submitLabel="Créer mon compte"
          stacked
          action={signUpCandidateAction}
          onSuccess={goTo}
          fields={[
            { name: "first_name", label: "Prénom", required: true, autoComplete: "given-name" },
            { name: "last_name", label: "Nom", required: true, autoComplete: "family-name" },
            { name: "phone", label: "Téléphone", type: "tel", required: true, autoComplete: "tel", placeholder: "+224 620 00 00 00" },
            { name: "city", label: "Ville", required: true, autoComplete: "address-level2" },
            { name: "email", label: "Adresse e-mail", type: "email", required: true, autoComplete: "email", colSpan: 2 },
            { name: "password", label: "Mot de passe", type: "password", required: true, autoComplete: "new-password", help: PASSWORD_HELP },
            { name: "password_confirm", label: "Retapez le mot de passe", type: "password", required: true, autoComplete: "new-password" },
            { name: "accepted_terms", label: terms, type: "checkbox", required: true, colSpan: 2 },
          ]}
        />
      )}

      {type === "partenaire" && !withPassword && (
        <EntityForm
          key="partenaire-lien"
          schema={partnerEmailSignUpSchema}
          submitLabel="Demander un espace partenaire"
          stacked
          action={(v) => signUpWithEmailAction({ ...v, account_type: "partner" })}
          onSuccess={goTo}
          fields={[
            { name: "organization_name", label: "Nom de l'organisation", required: true, autoComplete: "organization", colSpan: 2 },
            { name: "first_name", label: "Prénom du contact", required: true, autoComplete: "given-name" },
            { name: "last_name", label: "Nom du contact", required: true, autoComplete: "family-name" },
            { name: "email", label: "E-mail professionnel", type: "email", required: true, autoComplete: "email" },
            { name: "phone", label: "Téléphone (facultatif)", type: "tel", autoComplete: "tel" },
          ]}
        />
      )}

      {type === "partenaire" && withPassword && (
        <EntityForm
          key="partenaire-mot-de-passe"
          schema={partnerSignUpSchema}
          submitLabel="Demander un espace partenaire"
          stacked
          action={signUpPartnerAction}
          onSuccess={goTo}
          fields={[
            { name: "organization_name", label: "Nom de l'organisation", required: true, autoComplete: "organization", colSpan: 2 },
            { name: "first_name", label: "Prénom du contact", required: true, autoComplete: "given-name" },
            { name: "last_name", label: "Nom du contact", required: true, autoComplete: "family-name" },
            { name: "email", label: "E-mail professionnel", type: "email", required: true, autoComplete: "email" },
            { name: "phone", label: "Téléphone (facultatif)", type: "tel", autoComplete: "tel" },
            { name: "password", label: "Mot de passe", type: "password", required: true, autoComplete: "new-password", help: PASSWORD_HELP },
            { name: "password_confirm", label: "Retapez le mot de passe", type: "password", required: true, autoComplete: "new-password" },
            { name: "accepted_terms", label: terms, type: "checkbox", required: true, colSpan: 2 },
          ]}
        />
      )}

      <p className="mt-4 text-center text-sm">
        <button type="button" onClick={() => setWithPassword((v) => !v)} className="font-medium text-electric-700 hover:underline">
          {withPassword ? "Plutôt sans mot de passe" : "Créer un compte avec un mot de passe"}
        </button>
      </p>
      {!withPassword && (
        <div className="mt-4">
          <TermsNote />
        </div>
      )}
    </div>
  );
}
