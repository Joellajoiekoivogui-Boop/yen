import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Card } from "@/components/ui";
import { getSession } from "@/lib/auth/session";
import { ResetForm } from "./reset-form";

export const metadata: Metadata = { title: "Nouveau mot de passe" };

export default async function ResetPasswordPage() {
  const session = await getSession();
  if (!session) redirect("/connexion?erreur=lien");
  return (
    <Card className="w-full max-w-md p-6 sm:p-8">
      <h1 className="text-2xl font-bold text-navy-900">Nouveau mot de passe</h1>
      <p className="mt-1 mb-6 text-sm text-muted">Choisissez un mot de passe robuste que vous n&apos;utilisez pas ailleurs.</p>
      <ResetForm />
    </Card>
  );
}
