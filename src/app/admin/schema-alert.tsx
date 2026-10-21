import { Alert } from "@/components/ui";
import { isDatabaseUpToDate } from "@/lib/schema-version";

/** Bandeau affiché à l'équipe YEN tant que la mise à jour SQL n'a pas été appliquée dans Supabase. */
export async function SchemaOutdatedAlert() {
  if (await isDatabaseUpToDate()) return null;
  return (
    <Alert tone="error" title="Base de données à mettre à jour">
      Certaines fonctions (CV, certificats, notifications) ne marcheront pas tant que la mise à jour n&apos;est pas faite. Dans Supabase : menu{" "}
      <strong>SQL Editor</strong> › <strong>New query</strong>, collez tout le contenu du fichier <code>supabase/installation/4-MISE-A-JOUR.sql</code>, puis cliquez sur{" "}
      <strong>Run</strong>. Rechargez ensuite cette page : ce message disparaît.
    </Alert>
  );
}
