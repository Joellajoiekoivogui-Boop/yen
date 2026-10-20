"use client";

import Link from "next/link";
import { useState } from "react";
import { z } from "zod";
import { EntityForm } from "@/components/forms/entity-form";
import { Alert } from "@/components/ui";
import { signUpCandidateAction, signUpPartnerAction } from "@/features/auth/actions";
import { candidateSignUpSchema, partnerSignUpSchema } from "@/features/auth/schemas";
import { availabilityLabel, candidateStatusLabel, opportunityLabel } from "@/lib/labels";
import { cn } from "@/lib/utils";

const opts = (rec: Record<string, string>) => Object.entries(rec).map(([value, label]) => ({ value, label }));
const PASSWORD_HELP = "10 caractères minimum, avec majuscule, minuscule et chiffre.";
const terms = (
  <>
    J&apos;accepte les <Link href="/conditions" target="_blank" className="underline">conditions d&apos;utilisation</Link> et la{" "}
    <Link href="/confidentialite" target="_blank" className="underline">politique de confidentialité</Link>
  </>
);

export function SignUpForms({ domains, initialType, phoneRequired }: { domains: { id: string; name: string }[]; initialType: "candidat" | "partenaire"; phoneRequired: boolean }) {
  const [type, setType] = useState(initialType);
  const [done, setDone] = useState<string | null>(null);

  if (done) return <Alert tone="success" title="Vérifiez votre boîte de réception">{done}</Alert>;

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
          schema={phoneRequired ? candidateSignUpSchema.and(phoneRequiredSchema) : candidateSignUpSchema}
          submitLabel="Créer mon compte"
          defaultValues={{ country: "Guinée", opportunity_types: [], status: "etudiant", availability: "immediate" }}
          action={signUpCandidateAction}
          onSuccess={(r) => {
            const to = r.ok ? (r.data as { redirectTo?: string } | undefined)?.redirectTo : undefined;
            if (to) window.location.assign(to);
            else if (r.ok) setDone(r.message ?? "Compte créé.");
          }}
          fields={[
            { name: "first_name", label: "Prénom", required: true, autoComplete: "given-name" },
            { name: "last_name", label: "Nom", required: true, autoComplete: "family-name" },
            { name: "email", label: "Adresse e-mail", type: "email", required: true, autoComplete: "email" },
            { name: "phone", label: `Téléphone${phoneRequired ? "" : " (facultatif)"}`, type: "tel", required: phoneRequired, autoComplete: "tel", placeholder: "+224 …" },
            { name: "city", label: "Ville", required: true },
            { name: "country", label: "Pays", required: true },
            { name: "institution", label: "Établissement de formation", required: true },
            { name: "yen_program", label: "Formation suivie chez YEN", required: true },
            { name: "education_level", label: "Niveau d'études", required: true, placeholder: "Ex. Licence 3, BTS, Master…" },
            { name: "graduation_year", label: "Année de formation ou de diplomation", type: "number", required: true, min: 1970, max: 2100 },
            { name: "status", label: "Statut", type: "select", required: true, options: opts(candidateStatusLabel) },
            { name: "availability", label: "Disponibilité", type: "select", required: true, options: opts(availabilityLabel) },
            { name: "primary_domain_id", label: "Domaine d'intérêt principal", type: "select", options: domains.map((d) => ({ value: d.id, label: d.name })) },
            { name: "interest_area", label: "Précisions sur votre projet professionnel", placeholder: "Ex. développement web, maintenance minière…" },
            { name: "opportunity_types", label: "Type d'opportunité recherchée", type: "checkboxes", required: true, options: opts(opportunityLabel) },
            { name: "password", label: "Mot de passe", type: "password", required: true, autoComplete: "new-password", help: PASSWORD_HELP },
            { name: "password_confirm", label: "Confirmer le mot de passe", type: "password", required: true, autoComplete: "new-password" },
            { name: "accepted_terms", label: terms, type: "checkbox", required: true, colSpan: 2 },
          ]}
        />
      ) : (
        <EntityForm
          key="partenaire"
          schema={partnerSignUpSchema}
          submitLabel="Demander un espace partenaire"
          defaultValues={{ country: "Guinée" }}
          action={signUpPartnerAction}
          onSuccess={(r) => r.ok && setDone(r.message ?? "Demande enregistrée.")}
          fields={[
            { name: "organization_name", label: "Nom de l'organisation", required: true, autoComplete: "organization" },
            { name: "organization_sector", label: "Secteur d'activité", required: true },
            { name: "first_name", label: "Prénom du contact", required: true, autoComplete: "given-name" },
            { name: "last_name", label: "Nom du contact", required: true, autoComplete: "family-name" },
            { name: "email", label: "E-mail professionnel", type: "email", required: true, autoComplete: "email" },
            { name: "phone", label: "Téléphone professionnel", type: "tel", autoComplete: "tel" },
            { name: "city", label: "Ville", required: true },
            { name: "country", label: "Pays", required: true },
            { name: "password", label: "Mot de passe", type: "password", required: true, autoComplete: "new-password", help: PASSWORD_HELP },
            { name: "password_confirm", label: "Confirmer le mot de passe", type: "password", required: true, autoComplete: "new-password" },
            { name: "accepted_terms", label: terms, type: "checkbox", required: true, colSpan: 2 },
          ]}
        />
      )}
    </div>
  );
}

const phoneRequiredSchema = z.object({ phone: z.string().trim().min(6, "Numéro de téléphone requis.") });
