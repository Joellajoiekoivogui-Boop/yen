import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Alert, Card } from "@/components/ui";
import { getSession, homePathFor } from "@/lib/auth/session";
import { isSupabaseConfigured } from "@/lib/env";
import { listDomains } from "@/features/catalog/queries";
import { getPublicSetting } from "@/features/admin/settings";
import { param } from "@/lib/utils";
import { SignUpForms } from "./sign-up-forms";

export const metadata: Metadata = { title: "Inscription" };

export default async function SignUpPage(props: PageProps<"/inscription">) {
  const sp = await props.searchParams;
  const session = await getSession().catch(() => null);
  if (session) redirect(homePathFor(session));
  const configured = isSupabaseConfigured();
  const domains = configured ? await listDomains() : [];
  const phoneRequired = configured ? (await getPublicSetting("registration.phone_required")) === true : false;
  return (
    <Card className="w-full max-w-3xl p-6 sm:p-8">
      <h1 className="text-2xl font-bold text-navy-900">Créer un compte</h1>
      <p className="mt-1 text-sm text-muted">Votre identifiant YEN unique sera généré après la confirmation de votre adresse e-mail.</p>
      <div className="mt-6">
        {!configured ? (
          <Alert tone="warning" title="Configuration requise">Supabase n&apos;est pas configuré : l&apos;inscription est indisponible.</Alert>
        ) : (
          <SignUpForms domains={domains.map((d) => ({ id: d.id, name: d.name }))} initialType={param(sp.type) === "partenaire" ? "partenaire" : "candidat"} phoneRequired={phoneRequired} />
        )}
      </div>
      <p className="mt-6 text-center text-sm text-slate-600">
        Déjà inscrit ? <Link href="/connexion" className="font-medium text-electric-700 hover:underline">Se connecter</Link>
      </p>
    </Card>
  );
}
