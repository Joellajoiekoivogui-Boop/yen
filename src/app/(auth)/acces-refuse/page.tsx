import { ShieldAlert } from "lucide-react";
import { ButtonLink, Card } from "@/components/ui";

export default function ForbiddenPage() {
  return (
    <Card className="w-full max-w-md p-8 text-center">
      <ShieldAlert className="mx-auto size-10 text-amber-500" aria-hidden />
      <h1 className="mt-4 text-xl font-bold text-navy-900">Accès refusé</h1>
      <p className="mt-2 text-sm text-muted">Votre rôle ne permet pas d&apos;accéder à cette page. Si vous pensez qu&apos;il s&apos;agit d&apos;une erreur, contactez l&apos;administrateur YEN.</p>
      <ButtonLink href="/" variant="outline" className="mt-6">Retour</ButtonLink>
    </Card>
  );
}
