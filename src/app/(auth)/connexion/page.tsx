import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Alert, Card } from "@/components/ui";
import { getSession, homePathFor } from "@/lib/auth/session";
import { isSupabaseConfigured } from "@/lib/env";
import { param } from "@/lib/utils";
import { SignInForm } from "./sign-in-form";

export const metadata: Metadata = { title: "Connexion" };

export default async function SignInPage(props: PageProps<"/connexion">) {
  const sp = await props.searchParams;
  const session = await getSession().catch(() => null);
  if (session) redirect(homePathFor(session));
  const next = param(sp.suivant);
  const error = param(sp.erreur);
  return (
    <Card className="w-full max-w-md p-6 sm:p-8">
      <h1 className="text-2xl font-bold text-navy-900">Connexion</h1>
      <p className="mt-1 text-sm text-muted">Connectez-vous à votre espace YEN Career Bridge.</p>
      <div className="mt-6 space-y-4">
        {!isSupabaseConfigured() && (
          <Alert tone="warning" title="Configuration requise">
            Supabase n&apos;est pas configuré (variables NEXT_PUBLIC_SUPABASE_URL et NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY). Consultez docs/INSTALLATION.md.
          </Alert>
        )}
        {error === "lien" && <Alert tone="error">Le lien utilisé est invalide ou a expiré. Demandez un nouveau lien.</Alert>}
        {param(sp.confirme) && <Alert tone="success">Adresse e-mail confirmée. Vous pouvez vous connecter.</Alert>}
        <SignInForm next={next} />
      </div>
      <p className="mt-6 border-t border-border pt-5 text-center text-sm text-slate-600">
        Pas encore de compte ? <Link href="/inscription" className="font-medium text-electric-700 hover:underline">Créer un compte</Link>
      </p>
    </Card>
  );
}
