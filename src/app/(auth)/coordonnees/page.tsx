import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Card } from "@/components/ui";
import { homePathFor, mustCompleteContact, requireUser } from "@/lib/auth/session";
import { ContactDetailsForm } from "./contact-details-form";

export const metadata: Metadata = { title: "Vos coordonnées" };

/** Étape obligatoire avant d'entrer dans l'espace candidat ou l'administration. */
export default async function ContactDetailsPage() {
  const ctx = await requireUser();
  if (!mustCompleteContact(ctx)) redirect(homePathFor(ctx));
  const p = ctx.profile;
  return (
    <Card className="w-full max-w-md p-6 sm:p-8">
      <h1 className="text-2xl font-bold text-navy-900">Vos coordonnées</h1>
      <p className="mt-1 text-sm text-muted">
        {ctx.isStaff
          ? "Avant d'accéder à l'administration, renseignez vos coordonnées : elles permettent à l'équipe YEN de vous joindre."
          : "Avant d'accéder à votre espace, renseignez vos coordonnées : l'équipe YEN s'en sert pour vous contacter au sujet des opportunités."}
      </p>
      <div className="mt-6">
        <ContactDetailsForm
          staff={ctx.isStaff}
          defaultValues={{ first_name: p.first_name, last_name: p.last_name, phone: p.phone ?? "", city: p.city ?? "", country: p.country }}
        />
      </div>
      <form action="/auth/deconnexion" method="post" className="mt-6 border-t border-border pt-5 text-center">
        <button type="submit" className="text-sm font-medium text-electric-700 hover:underline">
          Se déconnecter
        </button>
      </form>
    </Card>
  );
}
