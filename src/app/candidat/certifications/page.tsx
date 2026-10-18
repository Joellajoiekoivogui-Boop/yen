import type { Metadata } from "next";
import { Trophy } from "lucide-react";
import { Card, CardBody, CardHeader, PageHeader } from "@/components/ui";
import { requireCandidate } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/utils";
import { loadCandidateBundle } from "@/features/candidates/queries";
import { CertificationsList } from "./certs-client";

export const metadata: Metadata = { title: "Mes certifications" };

export default async function CertificationsPage() {
  const ctx = await requireCandidate();
  const supabase = await createClient();
  const b = await loadCandidateBundle(supabase, ctx.candidateId);
  if (!b) return null;
  return (
    <div className="space-y-6">
      <PageHeader title="Mes certifications" description="Ajoutez un lien de vérification lorsque l'organisme le permet : YEN pourra confirmer la certification." />
      <Card>
        <CardHeader icon={Trophy} title="Certifications" />
        <CardBody>
          <CertificationsList
            items={b.certifications.map((c) => ({
              id: c.id,
              title: c.name,
              subtitle: `${c.issuer}${c.issue_date ? ` · obtenue le ${formatDate(c.issue_date)}` : ""}${c.expiry_date ? ` · expire le ${formatDate(c.expiry_date)}` : ""}`,
              badges: [c.verification_status === "verifie" ? { label: "Vérifiée", tone: "green" as const } : c.verification_status === "rejete" ? { label: "Non validée", tone: "red" as const } : { label: "Non vérifiée", tone: "neutral" as const }],
              values: { name: c.name, issuer: c.issuer, issue_date: c.issue_date ?? "", expiry_date: c.expiry_date ?? "", credential_id: c.credential_id ?? "", credential_url: c.credential_url ?? "" },
            }))}
          />
        </CardBody>
      </Card>
    </div>
  );
}
