import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { MailCheck } from "lucide-react";
import { Alert, ButtonLink, Card } from "@/components/ui";
import { getSession, homePathFor } from "@/lib/auth/session";
import { param } from "@/lib/utils";
import { ConfirmLink } from "./confirm-link";

export const metadata: Metadata = { title: "Connexion par lien", robots: { index: false } };

/**
 * Lien reçu par e-mail (inscription ou connexion sans mot de passe). Ouvrir la page ne vérifie
 * rien : la vérification a lieu au clic sur « Continuer ». Les messageries qui ouvrent les liens
 * pour les analyser ne consomment donc pas le lien à la place de l'utilisateur.
 */
export default async function EmailLinkPage(props: PageProps<"/auth/lien">) {
  const session = await getSession().catch(() => null);
  if (session) redirect(homePathFor(session));
  const tokenHash = param((await props.searchParams).token_hash) ?? "";
  return (
    <Card className="w-full max-w-md p-6 sm:p-8">
      <span className="grid size-12 place-items-center rounded-full bg-navy-50 text-navy-800">
        <MailCheck className="size-6" aria-hidden />
      </span>
      <h1 className="mt-4 text-2xl font-bold text-navy-900">Bienvenue sur YEN Career Bridge</h1>
      {tokenHash ? (
        <>
          <p className="mt-1 text-sm text-muted">Un dernier clic pour ouvrir votre session.</p>
          <div className="mt-6">
            <ConfirmLink tokenHash={tokenHash} />
          </div>
        </>
      ) : (
        <div className="mt-6 space-y-4">
          <Alert tone="error">Ce lien est incomplet. Copiez-le en entier depuis l&apos;e-mail, ou demandez un nouveau lien.</Alert>
          <ButtonLink href="/connexion" variant="outline" className="w-full">
            Recevoir un nouveau lien
          </ButtonLink>
        </div>
      )}
    </Card>
  );
}
