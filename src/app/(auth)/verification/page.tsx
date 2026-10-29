import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { MailCheck } from "lucide-react";
import { Card } from "@/components/ui";
import { pendingVerification, RESEND_DELAY_S } from "@/features/auth/verification-cookie";
import { getSession, homePathFor } from "@/lib/auth/session";
import { VerifyCodeForm } from "./verify-code-form";

export const metadata: Metadata = { title: "Vérification de l'adresse e-mail" };

/** Après l'inscription : saisie du code de vérification envoyé par e-mail. */
export default async function VerificationPage() {
  const session = await getSession().catch(() => null);
  if (session) redirect(homePathFor(session));
  const { email, resendIn } = await pendingVerification();
  return (
    <Card className="w-full max-w-md p-6 sm:p-8">
      <span className="relative grid size-14 place-items-center">
        <span aria-hidden className="absolute inset-0 animate-ping-slow rounded-full bg-emerald-200" />
        <span className="relative grid size-14 animate-pop-in place-items-center rounded-full bg-emerald-50 text-emerald-600 ring-1 ring-emerald-200">
          <MailCheck className="size-6" aria-hidden />
        </span>
      </span>
      <h1 className="mt-4 text-2xl font-bold text-navy-900">
        {/* « e-mail » ne se coupe pas en fin de ligne */}
        Vérifiez votre adresse <span className="whitespace-nowrap">e-mail</span>
      </h1>
      <p className="mt-1 text-sm text-muted">
        {email
          ? "Nous venons de vous envoyer un code de vérification. Saisissez-le ci-dessous pour activer votre compte."
          : "Saisissez l'adresse utilisée lors de l'inscription et le code de vérification reçu par e-mail."}
      </p>
      <div className="mt-6">
        <VerifyCodeForm email={email} resendIn={resendIn} resendDelay={RESEND_DELAY_S} />
      </div>
      <p className="mt-6 border-t border-border pt-5 text-center text-sm text-slate-600">
        Adresse déjà vérifiée ?{" "}
        <Link href="/connexion" className="font-medium text-electric-700 hover:underline">
          Se connecter
        </Link>
      </p>
    </Card>
  );
}
