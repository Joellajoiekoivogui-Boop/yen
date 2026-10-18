import { UserX } from "lucide-react";
import { Card } from "@/components/ui";

export default function DisabledAccountPage() {
  return (
    <Card className="w-full max-w-md p-8 text-center">
      <UserX className="mx-auto size-10 text-red-500" aria-hidden />
      <h1 className="mt-4 text-xl font-bold text-navy-900">Compte désactivé</h1>
      <p className="mt-2 text-sm text-muted">Ce compte a été désactivé. Contactez l&apos;équipe YEN pour en connaître la raison ou demander sa réactivation.</p>
      <form action="/auth/deconnexion" method="post" className="mt-6">
        <button type="submit" className="text-sm font-medium text-electric-700 hover:underline">Se déconnecter</button>
      </form>
    </Card>
  );
}
