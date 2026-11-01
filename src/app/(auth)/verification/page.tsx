import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { MailCheck } from "lucide-react";
import { Card } from "@/components/ui";
import { pendingVerification, RESEND_DELAY_S } from "@/features/auth/verification-cookie";
import { getSession, homePathFor } from "@/lib/auth/session";
import { param, safeInternalPath } from "@/lib/utils";
import { VerifyCodeForm } from "./verify-code-form";

export const metadata: Metadata = { title: "Vérification de l'adresse e-mail", robots: { index: false } };

/** Après l'envoi d'un lien et d'un code (inscription ou connexion sans mot de passe) : saisie du code. */
export default async function VerificationPage(props: PageProps<"/verification">) {
  const session = await getSession().catch(() => null);
  if (session) redirect(homePathFor(session));
  const next = safeInternalPath(param((await props.searchParams).suivant)) ?? undefined;
  const { email, mode, resendIn } = await pendingVerification();
  const login = mode === "login";
  return (
    <Card className="w-full max-w-md p-6 sm:p-8">
      <span className="grid size-12 place-items-center rounded-full bg-navy-50 text-navy-800">
        <MailCheck className="size-6" aria-hidden />
      </span>
      <h1 className="mt-4 text-2xl font-bold text-navy-900">
        {/* « e-mail » ne se coupe pas en fin de ligne */}
        {login ? "Consultez vos e-mails" : <>Vérifiez votre adresse <span className="whitespace-nowrap">e-mail</span></>}
      </h1>
      <p className="mt-1 text-sm text-muted">
        {!email
          ? "Saisissez votre adresse et le code reçu par e-mail."
          : login
            ? "Si un compte correspond à cette adresse, un lien et un code viennent de vous être envoyés. Cliquez sur le lien, ou saisissez le code."
            : "Un lien et un code viennent de vous être envoyés. Cliquez sur le lien, ou saisissez le code."}
      </p>
      <div className="mt-6">
        <VerifyCodeForm email={email} mode={mode} next={next} resendIn={resendIn} resendDelay={RESEND_DELAY_S} />
      </div>
      <p className="mt-6 border-t border-border pt-5 text-center text-sm text-slate-600">
        {login ? (
          <>
            Pas encore de compte ?{" "}
            <Link href="/inscription" className="font-medium text-electric-700 hover:underline">
              Créer un compte
            </Link>
          </>
        ) : (
          <>
            Adresse déjà vérifiée ?{" "}
            <Link href="/connexion" className="font-medium text-electric-700 hover:underline">
              Se connecter
            </Link>
          </>
        )}
      </p>
    </Card>
  );
}
